import { describe, expect, it } from "vitest";

import {
  applyRules,
  depthOf,
  endpointKey,
  filterReason,
  ingestIntoSession,
  parseLine,
  parseRaw,
  rankEndpoints,
  rescoreSession,
  templateOf,
} from "../electron/lib/ingest.js";
import { defaultRules, normaliseRules, rulesHash } from "../electron/lib/rules.js";

const rules = defaultRules();

describe("parseLine", () => {
  it("parses a full URL", () => {
    const row = parseLine("https://api.acme.example/v1/orders/1042?expand=items");
    expect(row).toMatchObject({
      method: "GET",
      host: "api.acme.example",
      path: "/v1/orders/1042",
      query: "?expand=items",
    });
  });

  it("parses a path-only line", () => {
    const row = parseLine("/api/v1/users/7/profile");
    expect(row).toMatchObject({ host: "unknown", path: "/api/v1/users/7/profile" });
  });

  it("parses host/path without a scheme", () => {
    const row = parseLine("api.acme.example/v1/invoices");
    expect(row).toMatchObject({ host: "api.acme.example", path: "/v1/invoices" });
  });

  it("parses IPv4 host/path pairs", () => {
    const row = parseLine("10.20.30.40/api/v1/users/1");
    expect(row).toMatchObject({ host: "10.20.30.40", path: "/api/v1/users/1" });
  });

  it("parses an optional method prefix", () => {
    const row = parseLine("PATCH /v1/projects/prj_44");
    expect(row).toMatchObject({ method: "PATCH", path: "/v1/projects/prj_44" });
  });

  it("rejects blank lines, comments, garbage and non-http schemes", () => {
    expect(parseLine("   ")).toBeNull();
    expect(parseLine("# comment")).toBeNull();
    expect(parseLine("two words here")).toBeNull();
    expect(parseLine("ftp://example.com/x")).toBeNull();
  });

  it("handles protocol-relative URLs", () => {
    const row = parseLine("//api.acme.example/v1/orders/1");
    expect(row).toMatchObject({ host: "api.acme.example", path: "/v1/orders/1" });
  });
});

describe("templates and depth", () => {
  it("replaces numeric, uuid and hash segments", () => {
    expect(templateOf("/v1/orders/104881/items")).toBe("/v1/orders/{id}/items");
    expect(templateOf("/v1/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001.pdf")).toBe(
      "/v1/invoices/{uuid}.pdf",
    );
    expect(templateOf("/v1/objects/0123456789abcdef0123456789abcdef")).toBe(
      "/v1/objects/{hash}",
    );
  });

  it("counts path depth", () => {
    expect(depthOf("/")).toBe(0);
    expect(depthOf("/a/b/c")).toBe(3);
  });
});

describe("filtering", () => {
  it("filters ignored extensions case-insensitively", () => {
    expect(filterReason("/static/app.CSS", rules)).toEqual({ code: "extension", detail: ".css" });
    expect(filterReason("/v1/report.pdf", rules)).toBeNull();
  });

  it("matches whole path segments, not substrings", () => {
    expect(filterReason("/health", rules)).toEqual({ code: "segment", detail: "/health" });
    expect(filterReason("/api/health/live", rules)).toEqual({ code: "segment", detail: "/health" });
    expect(filterReason("/healthcare/patients", rules)).toBeNull();
  });

  it("supports multi-segment rules", () => {
    const custom = normaliseRules({ ...rules, ignoredSegments: ["/api/internal"] });
    expect(filterReason("/api/internal/debug", custom)?.code).toBe("segment");
    expect(filterReason("/api/internally", custom)).toBeNull();
  });
});

describe("scoring", () => {
  it("scores a sequential numeric id with the configured weight", () => {
    const row = parseLine("/api/v2/orders/104881")!;
    const scored = applyRules([{ ...row, id: "e1" }], rules)[0];
    const numeric = scored.reasons.find((r) => r.code === "numeric_id");
    expect(numeric?.delta).toBe(rules.weights.numericId * 1);
    // Reasons are the single source of truth: the score must be their sum.
    const total = scored.reasons.reduce((acc, r) => acc + r.delta, 0);
    expect(scored.score).toBe(total);
    expect(scored.reasons.some((r) => r.code === "keyword" && r.label === "order")).toBe(
      true,
    );
  });

  it("caps numeric id scoring at two segments", () => {
    const row = parseLine("/1/2/3")!;
    const scored = applyRules([{ ...row, id: "e1" }], rules)[0];
    const numeric = scored.reasons.find((r) => r.code === "numeric_id");
    expect(numeric?.delta).toBe(rules.weights.numericId * 2);
  });

  it("adds keyword weights once per keyword", () => {
    const row = parseLine("/admin/users")!;
    const scored = applyRules([{ ...row, id: "e1" }], rules)[0];
    const keywords = scored.reasons.filter((r) => r.code === "keyword").map((r) => r.label);
    expect(keywords).toContain("admin");
    expect(keywords).toContain("user");
  });

  it("scores uuid and query parameters", () => {
    const row = parseLine(
      "/v1/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001?limit=10&page=2",
    )!;
    const scored = applyRules([{ ...row, id: "e1" }], rules)[0];
    expect(scored.reasons.some((r) => r.code === "uuid")).toBe(true);
    expect(scored.reasons.find((r) => r.code === "query")?.delta).toBe(
      rules.weights.queryParam * 2,
    );
  });

  it("respects a zero weight", () => {
    const custom = normaliseRules({ ...rules, weights: { ...rules.weights, numericId: 0 } });
    const row = parseLine("/v1/orders/42")!;
    const scored = applyRules([{ ...row, id: "e1" }], custom)[0];
    expect(scored.reasons.some((r) => r.code === "numeric_id")).toBe(false);
  });
});

describe("parseRaw", () => {
  it("dedupes identical endpoints and reports counts", () => {
    const raw = [
      "https://api.acme.example/v1/orders/1",
      "https://api.acme.example/v1/orders/1",
      "GET https://api.acme.example/v1/orders/1",
      "",
      "# note",
      "not a url at all",
      "/v1/users/2",
    ].join("\n");

    const { rows, counts } = parseRaw(raw);
    expect(rows).toHaveLength(2);
    // Same endpoint listed twice plus once with an explicit GET prefix.
    expect(counts.duplicates).toBe(2);
    expect(counts.invalid).toBe(1);
    expect(rows.map(endpointKey)).toEqual([
      "GET api.acme.example/v1/orders/1",
      "GET unknown/v1/users/2",
    ]);
  });
});

describe("session lifecycle", () => {
  const base = {
    schemaVersion: 1,
    id: "s1",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    rulesHash: "x",
    rulesSnapshot: rules,
    source: { kind: "paste", name: null, importedAt: "2026-01-01T00:00:00.000Z" },
    stats: { lines: 0, skipped: 0, invalid: 0, duplicates: 0, ingested: 0, kept: 0, filtered: 0, maxScore: 0, avgScore: 0 },
    endpoints: [],
  };

  it("imports, filters and ranks", () => {
    const raw = "/static/app.css\n/api/orders/42\n/health\n/api/users/9";
    const session = ingestIntoSession(base, raw, "replace", rules, "recon.txt", "2026-01-02T00:00:00.000Z");

    expect(session.stats.ingested).toBe(4);
    expect(session.stats.kept).toBe(2);
    expect(session.stats.filtered).toBe(2);
    expect(session.endpoints.filter((e) => !e.kept)).toHaveLength(2);

    const ranked = rankEndpoints(session.endpoints);
    expect(ranked[0].kept).toBe(true);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("appends without duplicating existing endpoints", () => {
    const first = ingestIntoSession(base, "/api/orders/42", "replace", rules, null, "2026-01-02T00:00:00.000Z");
    const second = ingestIntoSession(
      first,
      "/api/orders/42\n/api/users/9",
      "append",
      rules,
      null,
      "2026-01-03T00:00:00.000Z",
    );

    expect(second.stats.ingested).toBe(2);
    expect(second.stats.duplicates).toBe(1);
    expect(second.endpoints).toHaveLength(2);
  });

  it("rescore brings filtered endpoints back when a rule is relaxed", () => {
    const filtered = ingestIntoSession(base, "/static/app.css\n/api/orders/42", "replace", rules, null, "2026-01-02T00:00:00.000Z");
    expect(filtered.stats.kept).toBe(1);

    const relaxed = normaliseRules({
      ...rules,
      ignoredExtensions: [],
      ignoredSegments: [],
    });
    const rescored = rescoreSession(filtered, relaxed, "2026-01-03T00:00:00.000Z");

    expect(rescored.stats.kept).toBe(2);
    expect(rescored.rulesHash).toBe(rulesHash(relaxed));
  });
});

describe("rules", () => {
  it("normalises extensions, segments and keywords", () => {
    const clean = normaliseRules({
      ignoredExtensions: ["css", ".CSS", "woff2", ""],
      ignoredSegments: ["static/", "/assets", "/"],
      keywords: [
        { value: "Admin", weight: 500 },
        { value: "admin", weight: 1 },
        { value: "not valid!", weight: 4 },
      ],
      sensitiveParams: ["ID", "order_id", "order_id"],
      weights: { numericId: 999 },
    });

    expect(clean.ignoredExtensions).toEqual([".css", ".woff2"]);
    expect(clean.ignoredSegments).toEqual(["/static", "/assets"]);
    expect(clean.keywords).toEqual([{ value: "admin", weight: 100 }]);
    expect(clean.sensitiveParams).toEqual(["id", "order_id"]);
    expect(clean.weights.numericId).toBe(100);
    expect(clean.weights.base).toBe(rules.weights.base);
  });

  it("hashes rules stably regardless of keyword order", () => {
    const a = normaliseRules({ ...rules, keywords: [{ value: "user", weight: 8 }, { value: "admin", weight: 9 }] });
    const b = normaliseRules({ ...rules, keywords: [{ value: "admin", weight: 9 }, { value: "user", weight: 8 }] });
    expect(rulesHash(a)).toBe(rulesHash(b));
  });

  it("changes hash when a weight changes", () => {
    const a = normaliseRules(rules);
    const b = normaliseRules({ ...rules, weights: { ...rules.weights, numericId: 40 } });
    expect(rulesHash(a)).not.toBe(rulesHash(b));
  });
});
