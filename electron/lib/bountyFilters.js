/**
 * Bounty filtering and sorting.
 *
 * Pure module shared by the main process (CSV export) and the renderer (live
 * table). Filters are plain data so a saved view is just a JSON snapshot.
 */

const TYPES = ["bounty", "vdp", "external"];
const SORTS = ["maxBounty", "minBounty", "reports", "responseEfficiency", "launched", "name"];

function text(value) {
  return typeof value === "string" ? value : "";
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function emptyFilters() {
  return {
    query: "",
    minBounty: null,
    maxBounty: null,
    types: [],
    minReports: null,
    minResponseEfficiency: null,
    launchedAfter: null,
    includeKeywords: "",
    excludeKeywords: "",
    shortlistedOnly: false,
  };
}

export function normaliseFilters(input) {
  const base = emptyFilters();
  if (!input || typeof input !== "object") return base;
  const types = Array.isArray(input.types)
    ? [...new Set(input.types.filter((type) => TYPES.includes(type)))]
    : [];
  const year = text(input.launchedAfter).trim();

  return {
    query: collapse(text(input.query)),
    minBounty: integerOrNull(input.minBounty),
    maxBounty: integerOrNull(input.maxBounty),
    types,
    minReports: integerOrNull(input.minReports),
    minResponseEfficiency: integerOrNull(input.minResponseEfficiency),
    launchedAfter: /^\d{4}$/.test(year) ? year : null,
    includeKeywords: collapse(text(input.includeKeywords)),
    excludeKeywords: collapse(text(input.excludeKeywords)),
    shortlistedOnly: Boolean(input.shortlistedOnly),
  };
}

function collapse(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function normaliseSort(value) {
  return SORTS.includes(value) ? value : "maxBounty";
}

function tokensOf(value) {
  return collapse(text(value).toLowerCase())
    .split(/[,\s]+/)
    .filter(Boolean);
}

function haystackOf(bounty) {
  return [
    text(bounty.name),
    text(bounty.handle),
    text(bounty.platform),
    text(bounty.type),
    ...(Array.isArray(bounty.tags) ? bounty.tags : []),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesFilters(bounty, filters, shortlistedIds = new Set()) {
  const topPayout = bounty.maxBounty ?? bounty.minBounty;

  if (filters.minBounty != null && (topPayout == null || topPayout < filters.minBounty)) {
    return false;
  }
  if (filters.maxBounty != null && (topPayout == null || topPayout > filters.maxBounty)) {
    return false;
  }
  if (filters.types.length && !filters.types.includes(bounty.type)) return false;
  if (filters.minReports != null && (bounty.reports == null || bounty.reports < filters.minReports)) {
    return false;
  }
  if (
    filters.minResponseEfficiency != null &&
    (bounty.responseEfficiency == null ||
      bounty.responseEfficiency < filters.minResponseEfficiency)
  ) {
    return false;
  }
  if (filters.launchedAfter) {
    const launched = bounty.launchedAt ? new Date(bounty.launchedAt) : null;
    if (!launched || !Number.isFinite(launched.getTime())) return false;
    if (launched.getFullYear() < Number(filters.launchedAfter)) return false;
  }
  if (filters.shortlistedOnly && !shortlistedIds.has(bounty.id)) return false;

  const haystack = haystackOf(bounty);

  if (filters.query) {
    const needle = filters.query.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  for (const token of tokensOf(filters.includeKeywords)) {
    if (!haystack.includes(token)) return false;
  }
  for (const token of tokensOf(filters.excludeKeywords)) {
    if (haystack.includes(token)) return false;
  }

  return true;
}

export function filterBounties(rows, filters, shortlistedIds = new Set()) {
  const clean = normaliseFilters(filters);
  return (rows ?? []).filter((bounty) => matchesFilters(bounty, clean, shortlistedIds));
}

function payoutOf(bounty) {
  return bounty.maxBounty ?? bounty.minBounty ?? null;
}

function launchedOf(bounty) {
  if (!bounty.launchedAt) return null;
  const time = new Date(bounty.launchedAt).getTime();
  return Number.isFinite(time) ? time : null;
}

function descending(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function sortBounties(rows, sort) {
  const key = normaliseSort(sort);
  const sorted = [...(rows ?? [])];
  sorted.sort((a, b) => {
    let result = 0;
    if (key === "maxBounty") result = descending(payoutOf(a), payoutOf(b));
    else if (key === "minBounty") result = descending(a.minBounty, b.minBounty);
    else if (key === "reports") result = descending(a.reports, b.reports);
    else if (key === "responseEfficiency") {
      result = descending(a.responseEfficiency, b.responseEfficiency);
    } else if (key === "launched") result = descending(launchedOf(a), launchedOf(b));
    if (result !== 0) return result;
    return text(a.name).localeCompare(text(b.name));
  });
  return sorted;
}

export function applyBountyView(rows, filters, sort, shortlistedIds = new Set()) {
  return sortBounties(filterBounties(rows, filters, shortlistedIds), sort);
}

export function activeFilterCount(filters) {
  const clean = normaliseFilters(filters);
  let count = 0;
  if (clean.query) count += 1;
  if (clean.minBounty != null) count += 1;
  if (clean.maxBounty != null) count += 1;
  if (clean.types.length) count += 1;
  if (clean.minReports != null) count += 1;
  if (clean.minResponseEfficiency != null) count += 1;
  if (clean.launchedAfter) count += 1;
  if (clean.includeKeywords) count += 1;
  if (clean.excludeKeywords) count += 1;
  if (clean.shortlistedOnly) count += 1;
  return count;
}

export function filterLabels(filters) {
  const clean = normaliseFilters(filters);
  const labels = [];
  if (clean.query) labels.push({ key: "query", text: `Search: ${clean.query}` });
  if (clean.minBounty != null) {
    labels.push({ key: "minBounty", text: `Top payout ≥ $${clean.minBounty.toLocaleString()}` });
  }
  if (clean.maxBounty != null) {
    labels.push({ key: "maxBounty", text: `Top payout ≤ $${clean.maxBounty.toLocaleString()}` });
  }
  if (clean.types.length) {
    const names = { bounty: "Bounty", vdp: "VDP", external: "External" };
    labels.push({
      key: "types",
      text: clean.types.map((type) => names[type] ?? type).join(" · "),
    });
  }
  if (clean.minReports != null) {
    labels.push({ key: "minReports", text: `Reports ≥ ${clean.minReports.toLocaleString()}` });
  }
  if (clean.minResponseEfficiency != null) {
    labels.push({ key: "minResponseEfficiency", text: `Response ≥ ${clean.minResponseEfficiency}%` });
  }
  if (clean.launchedAfter) {
    labels.push({ key: "launchedAfter", text: `Launched after ${clean.launchedAfter}` });
  }
  if (clean.includeKeywords) {
    labels.push({ key: "includeKeywords", text: `Includes: ${clean.includeKeywords}` });
  }
  if (clean.excludeKeywords) {
    labels.push({ key: "excludeKeywords", text: `Excludes: ${clean.excludeKeywords}` });
  }
  if (clean.shortlistedOnly) labels.push({ key: "shortlistedOnly", text: "Shortlisted only" });
  return labels;
}
