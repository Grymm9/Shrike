import { describe, expect, it } from "vitest";

import {
  HACKERONE_DIRECTORY_URL,
  bountyId,
  bountiesToCsv,
  hackerOneRequest,
  normaliseBountyCache,
  normaliseHackerOne,
  validateSourceUrl,
} from "../electron/lib/bounties.js";

describe("validateSourceUrl", () => {
  it("accepts HackerOne and normal public URLs", () => {
    expect(validateSourceUrl(HACKERONE_DIRECTORY_URL).hostname).toBe("hackerone.com");
    expect(validateSourceUrl("https://hackerone.com/shopify").url).toBe(
      "https://hackerone.com/shopify",
    );
  });

  it("rejects non-web, credential and private targets", () => {
    for (const url of [
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://2130706433/",
      "http://0x7f000001/",
      "https://example.com:8443/",
    ]) {
      expect(() => validateSourceUrl(url), url).toThrow();
    }
  });
});

describe("hackerOneRequest", () => {
  it("asks for paying bounties ordered by average payout", () => {
    const request = hackerOneRequest({ kind: "bounty" });
    const body = request.body as {
      variables: {
        cursor: string | null;
        secureOrderBy: unknown;
        where: { _and: Array<Record<string, unknown>> };
      };
    };
    expect(body.variables.cursor).toBeNull();
    expect(body.variables.secureOrderBy).toEqual({
      average_bounties: { amount: { _direction: "DESC" } },
    });
    expect(JSON.stringify(body.variables.where)).toContain('"offers_bounties":{"_eq":true}');
  });

  it("asks for VDPs ordered by launch date", () => {
    const request = hackerOneRequest({ kind: "vdp", cursor: "MjU" });
    const body = request.body as {
      variables: { cursor: string; secureOrderBy: unknown; where: unknown };
    };
    expect(body.variables.cursor).toBe("MjU");
    expect(body.variables.secureOrderBy).toEqual({
      launched_at: { _direction: "DESC" },
    });
    expect(JSON.stringify(body.variables.where)).toContain('"offers_bounties":{"_eq":false}');
  });
});

const bountyNode = {
  handle: "shopify",
  name: "Shopify",
  submission_state: "open",
  state: "public_mode",
  launched_at: "2016-03-01T00:00:00.000Z",
  resolved_report_count: 2530,
  currency: "usd",
  base_bounty: 500,
  minimum_bounty_table_value: 500,
  maximum_bounty_table_value: 50000,
  average_bounty_lower_amount: 1000,
  average_bounty_upper_amount: 3000,
  response_efficiency_percentage: 93,
  offers_bounties: true,
  scope_and_rewards_groups_enabled: true,
  external_program: null,
};

const vdpNode = {
  handle: "acme_vdp",
  name: "Acme VDP",
  submission_state: "open",
  state: "public_mode",
  launched_at: "2025-01-01T00:00:00.000Z",
  resolved_report_count: 4,
  currency: "usd",
  base_bounty: null,
  minimum_bounty_table_value: null,
  maximum_bounty_table_value: null,
  average_bounty_lower_amount: null,
  average_bounty_upper_amount: null,
  response_efficiency_percentage: 81,
  offers_bounties: false,
  scope_and_rewards_groups_enabled: false,
  external_program: null,
};

const externalNode = {
  ...bountyNode,
  handle: "external_co",
  name: "External Co",
  external_program: { id: "external-1" },
};

function payload(nodes: unknown[]) {
  return {
    data: {
      teams: {
        total_count: 449,
        pageInfo: { endCursor: "NTA", hasNextPage: true },
        edges: nodes.map((node) => ({ node })),
      },
    },
  };
}

describe("normaliseHackerOne", () => {
  it("maps bounty fields and derives the type", () => {
    const page = normaliseHackerOne(payload([bountyNode, vdpNode, externalNode]));

    expect(page.total).toBe(449);
    expect(page.cursor).toBe("NTA");
    expect(page.hasNext).toBe(true);
    expect(page.programs).toHaveLength(3);

    const bounty = page.programs[0];
    expect(bounty).toMatchObject({
      id: "hackerone:shopify",
      source: "hackerone",
      handle: "shopify",
      name: "Shopify",
      url: "https://hackerone.com/shopify",
      platform: "HackerOne",
      currency: "USD",
      minBounty: 500,
      maxBounty: 50000,
      averageBounty: 2000,
      reports: 2530,
      responseEfficiency: 93,
      type: "bounty",
    });
    expect(bounty.tags).toEqual(["Scope & rewards", "Open"]);

    expect(page.programs[1]).toMatchObject({
      type: "vdp",
      minBounty: null,
      maxBounty: null,
      responseEfficiency: 81,
    });
    expect(page.programs[2]).toMatchObject({ type: "external" });
    expect(page.programs[2].tags).toContain("External");
  });

  it("falls back to whichever payout value exists", () => {
    const page = normaliseHackerOne(
      payload([{ ...bountyNode, maximum_bounty_table_value: null }]),
    );
    expect(page.programs[0]).toMatchObject({ minBounty: 500, maxBounty: 500 });
  });

  it("surfaces GraphQL errors", () => {
    expect(() => normaliseHackerOne({ errors: [{ message: "Invalid CSRF token" }] })).toThrow(
      /Invalid CSRF token/,
    );
  });
});

describe("normaliseBountyCache", () => {
  it("falls back to an empty cache for missing or corrupt data", () => {
    expect(normaliseBountyCache(null)).toMatchObject({
      fetchedAt: null,
      scanned: 0,
      programs: [],
    });
    expect(normaliseBountyCache({ programs: "nope" }).programs).toEqual([]);
  });

  it("keeps valid rows and drops malformed ones", () => {
    const cache = normaliseBountyCache({
      fetchedAt: "2026-11-08T00:00:00.000Z",
      scanned: 2,
      programs: [
        {
          handle: "shopify",
          name: "Shopify",
          type: "bounty",
          maxBounty: 50000,
        },
        { name: "No handle" },
      ],
    });
    expect(cache.programs).toHaveLength(1);
    expect(cache.programs[0].id).toBe(bountyId("shopify"));
    expect(cache.scanned).toBe(2);
  });
});

describe("bountiesToCsv", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    const csv = bountiesToCsv([
      {
        id: "hackerone:acme",
        source: "hackerone",
        handle: "acme",
        name: '=HYPERLINK("x")',
        url: "https://hackerone.com/acme",
        platform: "HackerOne",
        description: null,
        currency: "USD",
        minBounty: 500,
        maxBounty: 5000,
        averageBounty: null,
        reports: 12,
        responseEfficiency: 90,
        launchedAt: "2020-01-01T00:00:00.000Z",
        type: "bounty",
        tags: ["Open", "Scope & rewards"],
      },
    ]);

    expect(csv).toContain("Name,Handle,Type,Platform");
    expect(csv).toContain("'=HYPERLINK(\"\"x\"\")");
    expect(csv).toContain("https://hackerone.com/acme");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
