/**
 * Filtering and scoring rules.
 *
 * Pure module: no Node built-ins, no DOM. Imported by the Electron main process
 * (for authoritative scoring on save) and by the renderer (for live preview in
 * Settings and the import dialog). One implementation, two consumers.
 */

export const RULES_VERSION = 1;

export const DEFAULT_RULES = {
  ignoredExtensions: [
    ".css",
    ".js",
    ".mjs",
    ".map",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".webp",
    ".avif",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
  ],
  ignoredSegments: [
    "/static",
    "/assets",
    "/cdn-cgi",
    "/health",
    "/healthz",
    "/readyz",
    "/metrics",
    "/favicon.ico",
    "/robots.txt",
  ],
  keywords: [
    { value: "admin", weight: 9 },
    { value: "user", weight: 8 },
    { value: "billing", weight: 8 },
    { value: "payment", weight: 8 },
    { value: "account", weight: 7 },
    { value: "internal", weight: 7 },
    { value: "invoice", weight: 6 },
    { value: "order", weight: 6 },
    { value: "tenant", weight: 6 },
    { value: "token", weight: 6 },
    { value: "graphql", weight: 6 },
    { value: "document", weight: 5 },
    { value: "export", weight: 5 },
    { value: "team", weight: 5 },
    { value: "debug", weight: 5 },
  ],
  sensitiveParams: [
    "id",
    "uid",
    "uuid",
    "user_id",
    "account_id",
    "customer_id",
    "order_id",
    "invoice_id",
    "tenant_id",
    "org_id",
    "project_id",
    "workspace_id",
    "document_id",
    "file_id",
    "message_id",
    "payment_id",
    "card_id",
    "member_id",
    "team_id",
  ],
  weights: {
    base: 5,
    numericId: 12,
    uuid: 10,
    sensitiveParam: 8,
    queryParam: 2,
    depth: 3,
  },
};

function clampInt(value, fallback, min, max) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function uniqueStrings(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function normaliseExtension(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const withDot = raw.startsWith(".") ? raw : "." + raw;
  if (!/^\.[a-z0-9][a-z0-9._-]*$/.test(withDot)) return "";
  return withDot;
}

export function normaliseSegment(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  // A bare "/" rule can never match a real path segment, so treat it as empty
  // input rather than silently storing a dead rule.
  if (!trimmed) return "";
  if (!/^[a-z0-9._~{}-]+(\/[a-z0-9._~{}-]+)*$/.test(trimmed)) return "";
  return "/" + trimmed;
}

export function normaliseRules(input) {
  const source = input && typeof input === "object" ? input : {};
  const weightsIn = source.weights && typeof source.weights === "object" ? source.weights : {};
  const defaults = DEFAULT_RULES.weights;

  const keywords = [];
  const seenKeywords = new Set();
  if (Array.isArray(source.keywords)) {
    for (const kw of source.keywords) {
      if (!kw || typeof kw !== "object") continue;
      const value = String(kw.value ?? "").trim().toLowerCase();
      if (!value || !/^[a-z0-9._-]+$/.test(value)) continue;
      if (seenKeywords.has(value)) continue;
      seenKeywords.add(value);
      keywords.push({ value, weight: clampInt(kw.weight, 5, 0, 100) });
    }
  }

  return {
    ignoredExtensions: uniqueStrings(
      (Array.isArray(source.ignoredExtensions) ? source.ignoredExtensions : DEFAULT_RULES.ignoredExtensions)
        .map(normaliseExtension)
        .filter(Boolean),
    ),
    ignoredSegments: uniqueStrings(
      (Array.isArray(source.ignoredSegments) ? source.ignoredSegments : DEFAULT_RULES.ignoredSegments)
        .map(normaliseSegment)
        .filter(Boolean),
    ),
    keywords,
    sensitiveParams: uniqueStrings(
      (Array.isArray(source.sensitiveParams) ? source.sensitiveParams : DEFAULT_RULES.sensitiveParams)
        .map((p) => String(p ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
    weights: {
      base: clampInt(weightsIn.base, defaults.base, 0, 100),
      numericId: clampInt(weightsIn.numericId, defaults.numericId, 0, 100),
      uuid: clampInt(weightsIn.uuid, defaults.uuid, 0, 100),
      sensitiveParam: clampInt(weightsIn.sensitiveParam, defaults.sensitiveParam, 0, 100),
      queryParam: clampInt(weightsIn.queryParam, defaults.queryParam, 0, 100),
      depth: clampInt(weightsIn.depth, defaults.depth, 0, 100),
    },
  };
}

export function defaultRules() {
  return normaliseRules(DEFAULT_RULES);
}

function canonical(rules) {
  const k = [...rules.keywords].sort((a, b) => a.value.localeCompare(b.value));
  const w = rules.weights;
  return [
    rules.ignoredExtensions.join(","),
    rules.ignoredSegments.join(","),
    k.map((x) => x.value + ":" + x.weight).join(","),
    rules.sensitiveParams.join(","),
    [w.base, w.numericId, w.uuid, w.sensitiveParam, w.queryParam, w.depth].join(","),
  ].join("|");
}

/** Stable, dependency-free hash so sessions can record which rules produced a score. */
export function rulesHash(rules) {
  const text = canonical(normaliseRules(rules));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
