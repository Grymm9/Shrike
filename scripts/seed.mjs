/**
 * Seeds a throwaway Shrike workspace with believable recon data for UI review.
 *
 *   SHRIKE_WORKSPACE=... node scripts/seed.mjs
 *
 * Never point this at the real workspace: it writes sessions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { Store } from "../electron/lib/store.js";

const workspace =
  process.env.SHRIKE_WORKSPACE || path.join(os.tmpdir(), "opencode", "shrike-demo");

const ACME = `# acme.io — recon 2026-11-07
https://api.acme.io/v1/users/10294/profile
https://api.acme.io/v1/users/10294/settings
GET https://api.acme.io/v1/users/10294/sessions?active=true
https://api.acme.io/v1/admin/users/10294/roles
https://api.acme.io/v1/admin/audit-log?page=2&limit=100
https://api.acme.io/v1/billing/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001
https://api.acme.io/v1/billing/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001/pdf
https://api.acme.io/v1/billing/payment-methods/4471
https://api.acme.io/v1/accounts/8812/transactions?limit=50&cursor=eyJvZmZzZXQiOjUwfQ==
https://api.acme.io/v1/accounts/8812/members?role=admin
https://api.acme.io/v1/organizations/42/teams/7/members?role=admin&page=1
https://api.acme.io/v1/organizations/42/billing/plan
https://api.acme.io/v1/tenants/acme/documents/55021/download
https://api.acme.io/v1/tenants/acme/documents/55021/versions
https://api.acme.io/v1/tenants/globex/exports/orders?from=2026-10-01&to=2026-11-01
https://api.acme.io/v1/orders/104881
https://api.acme.io/v1/orders/104881/items
https://api.acme.io/v1/orders/104881/refund
https://api.acme.io/v1/invoices/2210/lines
https://api.acme.io/v1/projects/prj_9f2a41/keys
https://api.acme.io/v1/projects/prj_9f2a41/tokens
https://api.acme.io/v1/workspaces/ws_77/members/10294
https://api.acme.io/v1/team/invitations/8812
https://api.acme.io/v1/internal/debug/env
https://api.acme.io/v1/internal/feature-flags
https://api.acme.io/graphql?query=query%20%7B%20viewer%20%7B%20id%20email%20%7D%20%7D
https://api.acme.io/v1/search?q=invoice&scope=billing
https://api.acme.io/v1/admin/exports/users.csv
https://api.acme.io/v1/export/accounts?format=csv
https://api.acme.io/v1/messages/8f14e45fceea167a5a36dedd4bea2543
PATCH https://api.acme.io/v1/users/10294
DELETE https://api.acme.io/v1/users/10294/sessions/771
POST https://api.acme.io/v1/orders/104881/notes
https://cdn.acme.io/static/app.4f2a1c.js
https://cdn.acme.io/static/app.4f2a1c.css
https://cdn.acme.io/assets/logo.png
https://cdn.acme.io/assets/fonts/inter.woff2
https://api.acme.io/health
https://api.acme.io/healthz
https://api.acme.io/metrics
https://api.acme.io/robots.txt
https://api.acme.io/favicon.ico
https://api.acme.io/v1/status
https://api.acme.io/v1/version
https://api.acme.io/v1/billing/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001.png
https://api.acme.io/v1/orders/104881/items/1/image.jpg
https://api.acme.io/v1/users/10294/avatar.webp
https://api.acme.io/v1/documents/55021/render.svg
https://api.acme.io/static/js/vendor.chunk.js
https://api.acme.io/assets/icons/sprite.svg
https://api.acme.io/v1/docs
https://api.acme.io/v1/changelog
https://api.acme.io/v1/pricing
https://api.acme.io/v1/contact
https://api.acme.io/v1/users/10295/profile
https://api.acme.io/v1/users/10296/profile
https://api.acme.io/v1/users/10297/profile
https://api.acme.io/v1/accounts/8813/transactions
https://api.acme.io/v1/accounts/8814/transactions
https://api.acme.io/v1/orders/104882
https://api.acme.io/v1/orders/104883
https://api.acme.io/v1/invoices/2211/lines
https://api.acme.io/v1/invoices/2212/lines
https://api.acme.io/v1/projects/prj_9f2a42/keys
https://api.acme.io/v1/tenants/initech/documents/55100/download
https://api.acme.io/v1/tenants/initech/exports/users?format=ndjson
https://api.acme.io/v1/admin/impersonate/10294
https://api.acme.io/v1/admin/tenants/42/features
https://api.acme.io/v1/billing/plans
https://api.acme.io/v1/billing/upcoming-invoice
https://api.acme.io/v1/oauth/token
https://api.acme.io/v1/oauth/authorize?client_id=shrike&redirect_uri=https%3A%2F%2Facme.io%2Fcb
https://api.acme.io/v1/webhooks/8812/deliveries
https://api.acme.io/v1/audit/events?actor=10294&limit=25
https://api.acme.io/v1/users/10294/notifications
https://api.acme.io/v1/users/10294/api-keys
`;

const GLOBEX = `https://portal.globex.dev/api/v2/tickets/4410
https://portal.globex.dev/api/v2/tickets/4410/messages
https://portal.globex.dev/api/v2/tickets/4410/attachments/aa11bb22cc33dd44ee55ff66
https://portal.globex.dev/api/v2/customers/77123/invoices
https://portal.globex.dev/api/v2/customers/77123/contracts
https://portal.globex.dev/api/v2/admin/customers?status=active
https://portal.globex.dev/api/v2/internal/tasks
https://portal.globex.dev/api/v2/reports/export?month=2026-10
https://portal.globex.dev/api/v2/staff/8801/profile
https://portal.globex.dev/api/v2/staff/8801/permissions
https://portal.globex.dev/api/v2/auth/sessions?user=77123
https://portal.globex.dev/graphql
https://portal.globex.dev/health
https://portal.globex.dev/static/main.css
https://portal.globex.dev/assets/logo.png
https://portal.globex.dev/api/v2/version
https://portal.globex.dev/api/v2/settings
https://portal.globex.dev/api/v2/search?q=contract
`;

const INITECH = `10.20.30.40/api/v1/users/1
10.20.30.40/api/v1/users/1/roles
10.20.30.40/api/v1/admin/export
10.20.30.40/api/v1/billing/statements/2026-10
10.20.30.40/api/v1/internal/health
10.20.30.40/health
10.20.30.40/assets/app.js
`;

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

async function main() {
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });

  const store = new Store(workspace);
  await store.init();

  const specs = [
    { name: "Globex — HackerOne", raw: GLOBEX, source: "globex-recon.txt" },
    { name: "Initech — private program", raw: INITECH, source: "initech-10.20.30.40.txt" },
    { name: "Acme Corp — HackerOne", raw: ACME, source: "acme-api-2026-11-07.txt" },
  ];

  for (const spec of specs) {
    const session = await store.createSession(spec.name);
    await store.ingest(session.id, spec.raw, "replace", spec.source);
    // Distinct updatedAt values so session ordering is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await fs.writeFile(
    path.join(workspace, "config", "git-state.json"),
    JSON.stringify(
      { lastSyncAt: new Date(Date.now() - 11 * 60_000).toISOString() },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  git(workspace, ["init", "-b", "main"]);
  git(workspace, ["remote", "add", "origin", "git@github.com:janik/acme-recon.git"]);

  const sessions = await store.listSessions();
  console.log(`Seeded ${sessions.length} sessions in ${workspace}`);
  for (const meta of sessions) {
    console.log(
      `  ${meta.name}: ${meta.endpointCount} ing. / ${meta.keptCount} ranked / ${meta.filteredCount} filtered`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
