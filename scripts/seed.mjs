/**
 * Seeds a throwaway Shrike workspace with believable bounty data for UI review.
 *
 *   SHRIKE_WORKSPACE=... node scripts/seed.mjs
 *
 * Never point this at the real workspace: it overwrites the bounty cache,
 * saved views and shortlist.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import { Store } from "../electron/lib/store.js";
import { emptyFilters } from "../electron/lib/bountyFilters.js";

const workspace =
  process.env.SHRIKE_WORKSPACE || path.join(os.tmpdir(), "opencode", "shrike-demo");

const names = [
  ["Shopify", "shopify", "bounty", 500, 50000, 2530, 93, "2016-03-01"],
  ["GitLab", "gitlab", "bounty", 100, 35000, 2279, 91, "2016-02-01"],
  ["PayPal", "paypal", "bounty", 50, 30000, 2509, 93, "2018-09-01"],
  ["TikTok", "tiktok", "bounty", 250, 25000, 1680, 88, "2020-10-01"],
  ["Epic Games", "epicgames", "bounty", 200, 25000, 2629, 84, "2021-10-01"],
  ["CoinSpot", "coinspot", "bounty", 1000, 50000, 97, 96, "2021-04-01"],
  ["Nintendo", "nintendo", "bounty", 299, 50000, 194, 72, "2016-12-01"],
  ["Robinhood Markets", "robinhood", "bounty", 100, 25000, 150, 90, "2025-10-01"],
  ["Temu", "temu", "bounty", 500, 25000, 35, 82, "2023-11-01"],
  ["Vercel", "vercel", "bounty", 50, 10000, 354, 95, "2026-09-01"],
  ["Magic Eden", "magic-eden", "bounty", 200, 10000, 97, 89, "2022-11-01"],
  ["Scopely", "scopely", "bounty", 180, 10000, 414, 87, "2021-03-01"],
  ["Blend Labs", "blend-labs", "bounty", 250, 7500, 13, 90, "2022-09-01"],
  ["Six Group", "six-group", "bounty", 200, 7500, 21, 85, "2023-04-01"],
  ["Valve", "valve", "bounty", 100, 7500, 1555, 80, "2018-05-01"],
  ["Discourse", "discourse", "bounty", 256, 256, 285, 94, "2014-06-01"],
  ["Node.js", "nodejs", "bounty", 500, 500, 185, 92, "2014-01-01"],
  ["Ruby", "ruby", "bounty", 500, 500, 78, 90, "2014-01-01"],
  ["Matomo", "matomo", "bounty", 333, 13000, 393, 86, "2018-09-01"],
  ["Uber", "uber", "bounty", 300, 15000, 2697, 78, "2016-01-01"],
  ["Common Codes", "common_codes", "bounty", 100, 15000, 0, 87, "2026-09-01"],
  ["Smartsheet", "smartsheet_vdp", "vdp", null, null, 1, 95, "2026-10-01"],
  ["XP Inc", "xp_inc_vdp", "vdp", null, null, 3, 97, "2026-10-01"],
  ["Verisk", "verisk_vdp", "vdp", null, null, 0, 79, "2026-10-01"],
  ["Rails", "rails", "vdp", null, null, 7, 88, "2020-01-01"],
  ["Acme VDP", "acme_vdp", "vdp", null, null, 4, 81, "2025-01-01"],
  ["Cloudflare", "cloudflare", "bounty", 50, 20000, 1100, 83, "2016-06-01"],
  ["Dropbox", "dropbox", "bounty", 100, 32000, 730, 85, "2016-01-01"],
  ["Stripe", "stripe", "bounty", 100, 30000, 1400, 92, "2016-01-01"],
  ["Atlassian", "atlassian", "bounty", 100, 20000, 980, 80, "2017-01-01"],
  ["GitHub", "github", "bounty", 100, 30000, 1750, 90, "2016-01-01"],
  ["Mozilla", "mozilla", "bounty", 500, 20000, 620, 76, "2016-01-01"],
  ["Zoom", "zoom", "bounty", 250, 20000, 410, 82, "2020-04-01"],
  ["Yelp", "yelp", "bounty", 300, 15000, 300, 79, "2016-01-01"],
  ["Zendesk", "zendesk", "bounty", 100, 10000, 210, 84, "2018-01-01"],
  ["Figma", "figma", "bounty", 100, 12000, 88, 94, "2024-01-01"],
  ["Notion", "notion", "bounty", 100, 10000, 64, 89, "2023-06-01"],
  ["Linear", "linear", "bounty", 200, 8000, 22, 96, "2024-09-01"],
  ["Supabase", "supabase", "bounty", 100, 8000, 40, 93, "2023-02-01"],
  ["PlanetScale", "planetscale", "external", 300, 15000, 18, 91, "2022-06-01"],
];

const programs = names.map(([name, handle, type, min, max, reports, response, launched]) => ({
  id: `hackerone:${handle}`,
  source: "hackerone",
  handle,
  name,
  url: `https://hackerone.com/${handle}`,
  platform: "HackerOne",
  description: null,
  currency: "USD",
  minBounty: min,
  maxBounty: max,
  averageBounty: min != null && max != null ? Math.round((min + max) / 2) : null,
  reports,
  responseEfficiency: response,
  launchedAt: `${launched}T00:00:00.000Z`,
  type,
  tags: type === "external" ? ["External"] : type === "vdp" ? [] : ["Open"],
}));

const store = new Store(workspace);
await store.init();

// Make the demo reproducible: clear prior demo files before writing.
await fs.rm(path.join(workspace, "sessions"), { recursive: true, force: true });
await fs.rm(path.join(store.configDir, "bounties-bugcrowd.json"), { force: true });
await fs.rm(path.join(store.configDir, "bounties-yeswehack.json"), { force: true });
await fs.rm(path.join(workspace, "archive"), { recursive: true, force: true });
await fs.mkdir(store.sessionsDir, { recursive: true });

await store.writeBountyCache({
  schemaVersion: 1,
  source: "hackerone",
  fetchedAt: new Date().toISOString(),
  scanned: programs.length,
  programs,
});

const views = await store.readViews();
await store.writeViews({
  schemaVersion: 1,
  views: [
    ...views.views.filter((view) => view.id !== "cloud"),
    {
      id: "cloud",
      name: "Cloud",
      filters: {
        ...emptyFilters(),
        includeKeywords: "cloud",
      },
      sort: "maxBounty",
    },
  ],
});

await store.writeShortlist({
  schemaVersion: 1,
  items: {
    "hackerone:shopify": {
      id: "hackerone:shopify",
      status: "working",
      note: "GraphQL admin surface looks interesting.",
      savedAt: "2026-11-06T10:00:00.000Z",
    },
    "hackerone:gitlab": {
      id: "hackerone:gitlab",
      status: "interested",
      note: "Check CI runner scope.",
      savedAt: "2026-11-07T10:00:00.000Z",
    },
    "hackerone:vercel": {
      id: "hackerone:vercel",
      status: "submitted",
      note: "Report sent; waiting on triage.",
      savedAt: "2026-11-05T10:00:00.000Z",
    },
  },
});

// One old v1 file so the archive/delete controls are visible.
const legacyId = crypto.randomUUID();
await fs.writeFile(
  path.join(store.sessionsDir, `${legacyId}.json`),
  JSON.stringify({
    id: legacyId,
    name: "Acme Corp — old recon",
    updatedAt: "2026-10-01T09:00:00.000Z",
    stats: { ingested: 64 },
    endpoints: [],
  }) + "\n",
  "utf8",
);

console.log(`Seeded ${programs.length} bounties in ${workspace}`);
console.log("Open Settings to review the old engagement file.");
