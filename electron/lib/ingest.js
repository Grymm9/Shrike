/**
 * Endpoint parsing, filtering and scoring.
 *
 * Pure module: no Node built-ins, no DOM. Shared by the main process (authoritative
 * scoring + persistence) and the renderer (live preview while editing rules), so a
 * preview can never disagree with what gets saved.
 */

import { rulesHash } from "./rules.js";

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{24,}$/i;
const HOST_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/|$)/i;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/;
const LOCALHOST_RE = /^localhost(?::\d+)?(?:\/|$)/i;

export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function endpointKey(row) {
  return `${row.method} ${row.host}${row.path}${row.query || ""}`;
}

function splitPath(path) {
  return path.split("/").filter(Boolean);
}

/**
 * Replace concrete identifiers with placeholders so endpoints can be grouped.
 * Matching happens on the stem so `/invoices/<uuid>.pdf` still collapses to
 * `/invoices/{uuid}.pdf` while keeping the extension visible.
 */
export function templateOf(path) {
  const parts = splitPath(path).map((seg) => {
    const dot = seg.lastIndexOf(".");
    const hasExt = dot > 0 && dot < seg.length - 1;
    const stem = hasExt ? seg.slice(0, dot) : seg;
    const ext = hasExt ? seg.slice(dot) : "";
    if (/^\d+$/.test(stem)) return "{id}" + ext;
    if (UUID_RE.test(stem)) return "{uuid}" + ext;
    if (HEX_RE.test(stem)) return "{hash}" + ext;
    return seg;
  });
  return "/" + parts.join("/");
}

export function depthOf(path) {
  return splitPath(path).length;
}

export function extensionOf(path) {
  const last = path.split("/").filter(Boolean).pop() || "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) return "";
  return "." + last.slice(dot + 1).toLowerCase();
}

function normalisedPath(path) {
  return "/" + splitPath(path).join("/");
}

function segmentMatches(path, rule) {
  const p = normalisedPath(path);
  const r = "/" + rule.split("/").filter(Boolean).join("/");
  if (r === "/") return false;
  return p === r || p.startsWith(r + "/") || p.includes(r + "/") || p.endsWith(r);
}

/**
 * Parse one line of recon output. Accepts full URLs, host/path, path-only,
 * protocol-relative URLs and optional "METHOD " prefixes.
 */
export function parseLine(rawLine) {
  let line = String(rawLine ?? "").trim();
  if (!line || line.startsWith("#") || line.startsWith(";")) return null;

  let method = "GET";
  const methodMatch = line.match(METHOD_RE);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
    line = methodMatch[2].trim();
  }

  if (!line) return null;

  if (line.startsWith("//")) line = "http:" + line;

  let url;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
      url = new URL(line);
    } else if (line.startsWith("/")) {
      url = new URL("http://unknown" + line);
    } else if (HOST_RE.test(line) || IPV4_RE.test(line) || LOCALHOST_RE.test(line)) {
      url = new URL("http://" + line);
    } else if (!/\s/.test(line)) {
      url = new URL("http://unknown/" + line.replace(/^\/+/, ""));
    } else {
      return null;
    }
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) return null;

  const path = url.pathname || "/";
  const host = url.host || "unknown";
  return {
    method,
    host,
    path,
    query: url.search || "",
    url: `${url.protocol}//${host}${path}${url.search}`,
  };
}

export function filterReason(path, rules) {
  const ext = extensionOf(path);
  if (ext && rules.ignoredExtensions.includes(ext)) {
    return { code: "extension", detail: ext };
  }
  for (const segment of rules.ignoredSegments) {
    if (segmentMatches(path, segment)) {
      return { code: "segment", detail: segment };
    }
  }
  return null;
}

function tokensOf(path, query) {
  return (path + " " + query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function scoreEndpoint(row, rules) {
  const w = rules.weights;
  const reasons = [];
  let score = 0;

  if (w.base > 0) {
    score += w.base;
    reasons.push({ code: "base", label: "base", delta: w.base });
  }

  const segments = splitPath(row.path);

  const numericCount = segments.filter((s) => /^\d+$/.test(s)).length;
  if (numericCount > 0 && w.numericId > 0) {
    const delta = w.numericId * Math.min(numericCount, 2);
    score += delta;
    reasons.push({
      code: "numeric_id",
      label: numericCount > 1 ? `${numericCount} numeric ids` : "numeric id",
      delta,
    });
  }

  const uuidCount = segments.filter((s) => UUID_RE.test(s)).length;
  if (uuidCount > 0 && w.uuid > 0) {
    const delta = w.uuid * Math.min(uuidCount, 2);
    score += delta;
    reasons.push({ code: "uuid", label: uuidCount > 1 ? `${uuidCount} uuids` : "uuid", delta });
  }

  const tokens = tokensOf(row.path, row.query);
  const tokenSet = new Set(tokens);

  for (const keyword of rules.keywords) {
    const hit = tokens.some(
      (t) => t === keyword.value || (keyword.value.length >= 4 && t.startsWith(keyword.value)),
    );
    if (hit && keyword.weight > 0) {
      score += keyword.weight;
      reasons.push({ code: "keyword", label: keyword.value, delta: keyword.weight });
    }
  }

  if (w.sensitiveParam > 0 && rules.sensitiveParams.length) {
    let queryKeys = [];
    try {
      queryKeys = [...new URLSearchParams(row.query).keys()].map((k) => k.toLowerCase());
    } catch {
      queryKeys = [];
    }
    const matched = rules.sensitiveParams.find(
      (p) => queryKeys.includes(p) || tokenSet.has(p),
    );
    if (matched) {
      score += w.sensitiveParam;
      reasons.push({ code: "sensitive_param", label: matched, delta: w.sensitiveParam });
    }
  }

  if (w.queryParam > 0 && row.query) {
    let count = 0;
    try {
      count = [...new URLSearchParams(row.query).keys()].length;
    } catch {
      count = 0;
    }
    if (count > 0) {
      const delta = w.queryParam * Math.min(count, 3);
      score += delta;
      reasons.push({
        code: "query",
        label: count === 1 ? "1 query param" : `${count} query params`,
        delta,
      });
    }
  }

  if (w.depth > 0 && segments.length > 3) {
    const delta = w.depth * Math.min(segments.length - 3, 3);
    score += delta;
    reasons.push({ code: "depth", label: `depth ${segments.length}`, delta });
  }

  return { score: Math.max(0, Math.round(score)), reasons };
}

function toBase(row) {
  return {
    id: row.id,
    method: row.method,
    host: row.host,
    path: row.path,
    query: row.query,
    url: row.url,
  };
}

export function applyRules(baseRows, rules) {
  return baseRows.map((row) => {
    const blocked = filterReason(row.path, rules);
    const template = templateOf(row.path);
    const depth = depthOf(row.path);
    if (blocked) {
      return {
        ...row,
        template,
        depth,
        score: 0,
        kept: false,
        reasons: [],
        filterReason: blocked,
      };
    }
    const scored = scoreEndpoint(row, rules);
    return {
      ...row,
      template,
      depth,
      score: scored.score,
      kept: true,
      reasons: scored.reasons,
      filterReason: null,
    };
  });
}

export function parseRaw(raw) {
  const physical = String(raw ?? "").split(/\r?\n/);
  let skipped = 0;
  let invalid = 0;
  let duplicates = 0;
  const seen = new Set();
  const rows = [];

  for (const line of physical) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      skipped += 1;
      continue;
    }
    const parsed = parseLine(trimmed);
    if (!parsed) {
      invalid += 1;
      continue;
    }
    const key = endpointKey(parsed);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      ...parsed,
      id: "ep_" + fnv1a(key).toString(16).padStart(8, "0"),
    });
  }

  return { rows, counts: { lines: physical.length - skipped, skipped, invalid, duplicates } };
}

export function computeStats(counts, endpoints) {
  const kept = endpoints.filter((e) => e.kept);
  const sum = kept.reduce((acc, e) => acc + e.score, 0);
  return {
    lines: counts.lines ?? 0,
    skipped: counts.skipped ?? 0,
    invalid: counts.invalid ?? 0,
    duplicates: counts.duplicates ?? 0,
    ingested: endpoints.length,
    kept: kept.length,
    filtered: endpoints.length - kept.length,
    maxScore: kept.reduce((acc, e) => Math.max(acc, e.score), 0),
    avgScore: kept.length ? Math.round(sum / kept.length) : 0,
  };
}

function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = endpointKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function emptySession(id, name, rules, now) {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    rulesHash: rulesHash(rules),
    rulesSnapshot: rules,
    source: { kind: "manual", name: null, importedAt: now },
    stats: computeStats({ lines: 0, skipped: 0, invalid: 0, duplicates: 0 }, []),
    endpoints: [],
  };
}

export function ingestIntoSession(session, raw, mode, rules, sourceName, now) {
  const parsed = parseRaw(raw);
  const append = mode === "append" && Array.isArray(session.endpoints);

  let counts = { ...parsed.counts };
  let base;

  if (append) {
    const existing = session.endpoints.map(toBase);
    const existingKeys = new Set(existing.map(endpointKey));
    const overlap = parsed.rows.filter((r) => existingKeys.has(endpointKey(r))).length;
    base = dedupe([...existing, ...parsed.rows]);
    counts = {
      lines: (session.stats?.lines ?? 0) + counts.lines,
      skipped: (session.stats?.skipped ?? 0) + counts.skipped,
      invalid: (session.stats?.invalid ?? 0) + counts.invalid,
      duplicates: (session.stats?.duplicates ?? 0) + counts.duplicates + overlap,
    };
  } else {
    base = dedupe(parsed.rows);
  }

  const endpoints = applyRules(base, rules);

  return {
    ...session,
    updatedAt: now,
    rulesHash: rulesHash(rules),
    rulesSnapshot: rules,
    source: {
      kind: sourceName ? "file" : "paste",
      name: sourceName || session.source?.name || null,
      importedAt: now,
    },
    stats: computeStats(counts, endpoints),
    endpoints,
  };
}

export function rescoreSession(session, rules, now) {
  const base = session.endpoints.map(toBase);
  const endpoints = applyRules(base, rules);
  return {
    ...session,
    updatedAt: now,
    rulesHash: rulesHash(rules),
    rulesSnapshot: rules,
    stats: computeStats(
      {
        lines: session.stats?.lines ?? 0,
        skipped: session.stats?.skipped ?? 0,
        invalid: session.stats?.invalid ?? 0,
        duplicates: session.stats?.duplicates ?? 0,
      },
      endpoints,
    ),
    endpoints,
  };
}

/** Ranked view used by the dashboard: kept first, score desc, path asc. */
export function rankEndpoints(endpoints) {
  return [...endpoints].sort((a, b) => {
    if (a.kept !== b.kept) return a.kept ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });
}
