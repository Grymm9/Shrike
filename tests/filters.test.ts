import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  applyBountyView,
  emptyFilters,
  filterBounties,
  filterLabels,
  matchesFilters,
  normaliseFilters,
  normaliseSort,
  sortBounties,
} from "../electron/lib/bountyFilters.js";
import type { Bounty } from "../src/lib/types";

function bounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    id: "hackerone:acme",
    source: "hackerone",
    handle: "acme",
    name: "Acme",
    url: "https://hackerone.com/acme",
    platform: "HackerOne",
    description: null,
    currency: "USD",
    minBounty: 500,
    maxBounty: 5000,
    averageBounty: 2000,
    reports: 100,
    responseEfficiency: 90,
    launchedAt: "2022-05-01T00:00:00.000Z",
    type: "bounty",
    tags: ["Open"],
    ...overrides,
  };
}

describe("normaliseFilters", () => {
  it("returns safe defaults", () => {
    expect(normaliseFilters(null)).toEqual(emptyFilters());
  });

  it("cleans invalid values", () => {
    const filters = normaliseFilters({
      query: "  cloud   security ",
      minBounty: "5",
      maxBounty: "12.7",
      types: ["vdp", "nope", "vdp"],
      minReports: "50.4",
      minResponseEfficiency: "90",
      launchedAfter: "24",
      includeKeywords: "  payments  ",
      excludeKeywords: "crypto",
      shortlistedOnly: "yes",
    });

    expect(filters.query).toBe("cloud security");
    expect(filters.minBounty).toBe(5);
    expect(filters.maxBounty).toBe(13);
    expect(filters.types).toEqual(["vdp"]);
    expect(filters.minReports).toBe(50);
    expect(filters.launchedAfter).toBeNull();
    expect(filters.includeKeywords).toBe("payments");
    expect(filters.shortlistedOnly).toBe(true);
  });
});

describe("matchesFilters", () => {
  it("filters on the top payout", () => {
    const filters = normaliseFilters({ ...emptyFilters(), minBounty: 5000 });
    expect(matchesFilters(bounty(), filters)).toBe(true);
    expect(matchesFilters(bounty({ maxBounty: 3000 }), filters)).toBe(false);
    expect(matchesFilters(bounty({ maxBounty: null, minBounty: null }), filters)).toBe(false);
  });

  it("supports a payout ceiling", () => {
    const filters = normaliseFilters({ ...emptyFilters(), maxBounty: 6000 });
    expect(matchesFilters(bounty({ maxBounty: 5000 }), filters)).toBe(true);
    expect(matchesFilters(bounty({ maxBounty: 30000 }), filters)).toBe(false);
  });

  it("filters type, reports and response efficiency", () => {
    expect(
      matchesFilters(bounty({ type: "vdp" }), { ...emptyFilters(), types: ["vdp"] }),
    ).toBe(true);
    expect(
      matchesFilters(bounty({ type: "bounty" }), { ...emptyFilters(), types: ["vdp"] }),
    ).toBe(false);

    const active = normaliseFilters({
      ...emptyFilters(),
      minReports: 500,
      minResponseEfficiency: 95,
    });
    expect(matchesFilters(bounty({ reports: 1000, responseEfficiency: 97 }), active)).toBe(true);
    expect(matchesFilters(bounty({ reports: 999 }), active)).toBe(false);
    expect(matchesFilters(bounty({ responseEfficiency: 94 }), active)).toBe(false);
    expect(matchesFilters(bounty({ responseEfficiency: null }), active)).toBe(false);
  });

  it("filters by launch year", () => {
    const filters = { ...emptyFilters(), launchedAfter: "2024" };
    expect(matchesFilters(bounty({ launchedAt: "2025-01-01T00:00:00.000Z" }), filters)).toBe(true);
    expect(matchesFilters(bounty({ launchedAt: "2023-12-31T00:00:00.000Z" }), filters)).toBe(false);
    expect(matchesFilters(bounty({ launchedAt: null }), filters)).toBe(false);
  });

  it("matches keywords against name, handle and tags", () => {
    const item = bounty({ name: "Acme Cloud", handle: "acme_cloud", tags: ["Payments"] });
    expect(matchesFilters(item, { ...emptyFilters(), includeKeywords: "cloud" })).toBe(true);
    expect(matchesFilters(item, { ...emptyFilters(), includeKeywords: "payments" })).toBe(true);
    expect(matchesFilters(item, { ...emptyFilters(), includeKeywords: "cloud crypto" })).toBe(
      false,
    );
    expect(matchesFilters(item, { ...emptyFilters(), excludeKeywords: "crypto" })).toBe(true);
    expect(matchesFilters(item, { ...emptyFilters(), excludeKeywords: "payments" })).toBe(false);
  });

  it("matches the search query", () => {
    expect(matchesFilters(bounty(), { ...emptyFilters(), query: "acm" })).toBe(true);
    expect(matchesFilters(bounty(), { ...emptyFilters(), query: "globex" })).toBe(false);
  });

  it("filters to the shortlist", () => {
    const shortlisted = new Set(["hackerone:acme"]);
    expect(
      matchesFilters(bounty(), { ...emptyFilters(), shortlistedOnly: true }, shortlisted),
    ).toBe(true);
    expect(
      matchesFilters(bounty(), { ...emptyFilters(), shortlistedOnly: true }, new Set()),
    ).toBe(false);
  });
});

describe("filterBounties and sortBounties", () => {
  const rows = [
    bounty({ id: "hackerone:a", name: "Alpha", maxBounty: 1000, reports: 5 }),
    bounty({ id: "hackerone:b", name: "Bravo", maxBounty: 50000, reports: 900 }),
    bounty({ id: "hackerone:c", name: "Charlie", maxBounty: null, minBounty: null, reports: 0 }),
  ];

  it("combines filters and sorting", () => {
    const result = applyBountyView(rows, { ...emptyFilters(), minReports: 1 }, "maxBounty");
    expect(result.map((item) => item.name)).toEqual(["Bravo", "Alpha"]);
  });

  it("sorts nulls last", () => {
    expect(sortBounties(rows, "maxBounty").map((item) => item.name)).toEqual([
      "Bravo",
      "Alpha",
      "Charlie",
    ]);
    expect(sortBounties(rows, "name").map((item) => item.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("normalises unknown sort keys", () => {
    expect(normaliseSort("bogus")).toBe("maxBounty");
  });
});

describe("filter metadata", () => {
  it("counts active criteria and describes them", () => {
    const filters = normaliseFilters({
      ...emptyFilters(),
      query: "cloud",
      minBounty: 5000,
      types: ["bounty"],
      minReports: 100,
      shortlistedOnly: true,
    });

    expect(activeFilterCount(filters)).toBe(5);
    const labels = filterLabels(filters).map((label) => label.text);
    expect(labels).toContain("Search: cloud");
    expect(labels).toContain("Top payout ≥ $5,000");
    expect(labels).toContain("Bounty");
    expect(labels).toContain("Reports ≥ 100");
    expect(labels).toContain("Shortlisted only");
  });

  it("reports no filters for the empty case", () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(filterLabels(emptyFilters())).toEqual([]);
    expect(filterBounties([], emptyFilters())).toEqual([]);
  });
});
