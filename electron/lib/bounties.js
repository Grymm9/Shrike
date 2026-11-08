/**
 * HackerOne bounty directory adapter.
 *
 * Pure module: no Node built-ins, no network. The main process owns fetching;
 * this module turns HackerOne's directory payload into a stable bounty model and
 * provides the URL gate used by the fetch and open-external paths.
 */

export const HACKERONE_DIRECTORY_URL = "https://hackerone.com/directory/programs";
export const HACKERONE_GRAPHQL_URL = "https://hackerone.com/graphql";
export const PAGE_SIZE = 25;
export const MAX_PAGES = 60;

const DIRECTORY_QUERY = `query ShrikeBounties($cursor: String, $secureOrderBy: FiltersTeamFilterOrder, $where: FiltersTeamFilterInput) {
  teams(first: 25, after: $cursor, secure_order_by: $secureOrderBy, where: $where) {
    total_count
    pageInfo { endCursor hasNextPage }
    edges {
      node {
        id
        handle
        name
        submission_state
        state
        launched_at
        resolved_report_count
        currency
        base_bounty
        minimum_bounty_table_value
        maximum_bounty_table_value
        average_bounty_lower_amount
        average_bounty_upper_amount
        response_efficiency_percentage
        offers_bounties
        scope_and_rewards_groups_enabled
        external_program { id }
      }
    }
  }
}`;

const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateIpv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

function isPrivateHost(hostname) {
  const host = hostname
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^[0-9.]+$/.test(host)) return true;
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("ff")) return true;
    if (host.startsWith("::ffff:")) return isPrivateIpv4(host.slice(7));
    return false;
  }
  return isPrivateIpv4(host);
}

/** Gate for any URL that leaves the app: http(s) only, public hosts only. */
export function validateSourceUrl(input) {
  let text = String(input ?? "").trim();
  if (!text) throw new Error("Paste a URL first.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https pages can be read.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  if (url.port) {
    throw new Error("Only the default web ports (80 and 443) are allowed.");
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("That address is local or private, so Shrike will not open it.");
  }

  url.hash = "";
  return {
    url: url.toString(),
    hostname: url.hostname.replace(/^www\./i, "").toLowerCase(),
  };
}

export function bountyId(handle) {
  return `hackerone:${handle}`;
}

export function hackerOneRequest({ cursor = null, kind = "bounty" } = {}) {
  const isVdp = kind === "vdp";
  const where = {
    _and: [
      { offers_bounties: { _eq: !isVdp } },
      {
        _or: [
          { submission_state: { _eq: "open" } },
          { external_program: {} },
        ],
      },
    ],
  };

  return {
    url: HACKERONE_GRAPHQL_URL,
    body: {
      operationName: "ShrikeBounties",
      query: DIRECTORY_QUERY,
      variables: {
        cursor: cursor || null,
        secureOrderBy: isVdp
          ? { launched_at: { _direction: "DESC" } }
          : { average_bounties: { amount: { _direction: "DESC" } } },
        where,
      },
    },
  };
}

function typeOfNode(node) {
  if (node?.external_program) return "external";
  if (node?.offers_bounties === false) return "vdp";
  return "bounty";
}

function averageOf(node) {
  const lower = numberOrNull(node?.average_bounty_lower_amount);
  const upper = numberOrNull(node?.average_bounty_upper_amount);
  if (lower == null && upper == null) return null;
  if (lower == null) return upper;
  if (upper == null) return lower;
  return Math.round((lower + upper) / 2);
}

export function normaliseHackerOne(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("HackerOne returned an unexpected response.");
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const detail = payload.errors[0]?.message;
    throw new Error(
      detail ? `HackerOne rejected the request: ${detail}` : "HackerOne rejected the request.",
    );
  }

  const teams = payload?.data?.teams;
  if (!teams || typeof teams !== "object") {
    throw new Error("HackerOne returned no bounty data.");
  }

  const edges = Array.isArray(teams.edges) ? teams.edges : [];
  const programs = [];

  for (const edge of edges) {
    const node = edge?.node;
    if (!node || typeof node !== "object") continue;
    const handle = typeof node.handle === "string" ? node.handle : "";
    const name = typeof node.name === "string" ? collapse(node.name) : "";
    if (!handle || !name) continue;

    const min = numberOrNull(node.minimum_bounty_table_value);
    const max =
      numberOrNull(node.maximum_bounty_table_value) ?? numberOrNull(node.base_bounty);
    const type = typeOfNode(node);

    const tags = [];
    if (type === "external") tags.push("External");
    if (node.scope_and_rewards_groups_enabled) tags.push("Scope & rewards");
    if (node.submission_state === "open") tags.push("Open");

    programs.push({
      id: bountyId(handle),
      source: "hackerone",
      handle,
      name,
      url: `https://hackerone.com/${encodeURIComponent(handle)}`,
      platform: "HackerOne",
      description: null,
      currency: node.currency ? String(node.currency).toUpperCase() : null,
      minBounty: min ?? max,
      maxBounty: max ?? min,
      averageBounty: averageOf(node),
      reports: numberOrNull(node.resolved_report_count),
      responseEfficiency: numberOrNull(node.response_efficiency_percentage),
      launchedAt: typeof node.launched_at === "string" ? node.launched_at : null,
      type,
      tags,
    });
  }

  return {
    programs,
    cursor: typeof teams.pageInfo?.endCursor === "string" ? teams.pageInfo.endCursor : null,
    hasNext: Boolean(teams.pageInfo?.hasNextPage),
    total: Number.isFinite(teams.total_count) ? teams.total_count : programs.length,
  };
}

function normaliseBounty(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.name !== "string" || typeof value.handle !== "string") return null;
  const type = ["bounty", "vdp", "external"].includes(value.type) ? value.type : "bounty";
  return {
    id: typeof value.id === "string" ? value.id : bountyId(value.handle),
    source: "hackerone",
    handle: value.handle,
    name: collapse(value.name),
    url:
      typeof value.url === "string"
        ? value.url
        : `https://hackerone.com/${encodeURIComponent(value.handle)}`,
    platform: "HackerOne",
    description: typeof value.description === "string" ? value.description : null,
    currency: typeof value.currency === "string" ? value.currency : null,
    minBounty: numberOrNull(value.minBounty),
    maxBounty: numberOrNull(value.maxBounty),
    averageBounty: numberOrNull(value.averageBounty),
    reports: numberOrNull(value.reports),
    responseEfficiency: numberOrNull(value.responseEfficiency),
    launchedAt: typeof value.launchedAt === "string" ? value.launchedAt : null,
    type,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string") : [],
  };
}

export function emptyBountyCache() {
  return {
    schemaVersion: 1,
    source: "hackerone",
    fetchedAt: null,
    scanned: 0,
    programs: [],
  };
}

export function normaliseBountyCache(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.programs)) {
    return emptyBountyCache();
  }
  const programs = raw.programs.map(normaliseBounty).filter(Boolean);
  return {
    schemaVersion: 1,
    source: "hackerone",
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : null,
    scanned: Number.isFinite(raw.scanned) ? raw.scanned : programs.length,
    programs,
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Prevent spreadsheet formula execution on values that begin with a trigger.
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function bountiesToCsv(rows) {
  const headers = [
    "Name",
    "Handle",
    "Type",
    "Platform",
    "Min payout",
    "Max payout",
    "Currency",
    "Reports",
    "Response efficiency",
    "Launched",
    "URL",
    "Tags",
  ];
  const lines = [headers.join(",")];
  for (const row of rows ?? []) {
    lines.push(
      [
        row.name,
        row.handle,
        row.type,
        row.platform,
        row.minBounty,
        row.maxBounty,
        row.currency,
        row.reports,
        row.responseEfficiency,
        row.launchedAt,
        row.url,
        (row.tags ?? []).join(" · "),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
