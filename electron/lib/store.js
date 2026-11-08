import fs from "node:fs/promises";
import path from "node:path";

import { emptyBountyCache, normaliseBountyCache } from "./bounties.js";
import { emptyFilters, normaliseFilters, normaliseSort } from "./bountyFilters.js";

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["interested", "working", "submitted"];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/** Write via temp file + fsync + atomic rename. A half-written file is never visible. */
async function atomicWrite(file, text) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

async function readJson(file) {
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

function nowIso() {
  return new Date().toISOString();
}

function defaultViews() {
  const year = String(new Date().getFullYear());
  const base = emptyFilters();
  return {
    schemaVersion: 1,
    views: [
      {
        id: "high-payout",
        name: "High payout",
        filters: normaliseFilters({ ...base, minBounty: 5000, types: ["bounty"] }),
        sort: "maxBounty",
      },
      {
        id: "new-programs",
        name: "New this year",
        filters: normaliseFilters({ ...base, launchedAfter: year }),
        sort: "launched",
      },
      {
        id: "vdp",
        name: "VDPs",
        filters: normaliseFilters({ ...base, types: ["vdp"] }),
        sort: "reports",
      },
    ],
  };
}

function cleanView(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.trim().slice(0, 80) : "";
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 80) : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    filters: normaliseFilters(value.filters),
    sort: normaliseSort(value.sort),
  };
}

function normaliseViews(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.views)) return defaultViews();
  const views = raw.views.map(cleanView).filter(Boolean);
  return {
    schemaVersion: 1,
    views,
  };
}

function normaliseShortlist(raw) {
  const items = {};
  const input = raw?.items;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [id, value] of Object.entries(input)) {
      if (!value || typeof value !== "object") continue;
      if (!STATUSES.includes(value.status)) continue;
      items[id] = {
        id,
        status: value.status,
        note: typeof value.note === "string" ? value.note.slice(0, 4000) : "",
        savedAt: typeof value.savedAt === "string" ? value.savedAt : nowIso(),
      };
    }
  }
  return { schemaVersion: 1, items };
}

function normaliseSettings(raw) {
  const cacheMinutes = Number(raw?.prefs?.cacheMinutes);
  const defaultViewId =
    typeof raw?.prefs?.defaultViewId === "string" ? raw.prefs.defaultViewId : null;
  return {
    schemaVersion: 3,
    prefs: {
      cacheMinutes:
        Number.isFinite(cacheMinutes) && cacheMinutes >= 1 && cacheMinutes <= 1440
          ? Math.round(cacheMinutes)
          : 15,
      defaultSort: normaliseSort(raw?.prefs?.defaultSort),
      defaultViewId,
      autoCheckUpdates: raw?.prefs?.autoCheckUpdates !== false,
    },
  };
}

export class Store {
  constructor(workspace) {
    this.workspace = workspace;
    this.sessionsDir = path.join(workspace, "sessions");
    this.configDir = path.join(workspace, "config");
    this.archiveDir = path.join(workspace, "archive", "engagements");
    this.settingsPath = path.join(this.configDir, "settings.json");
    this.bountiesPath = path.join(this.configDir, "bounties.json");
    this.viewsPath = path.join(this.configDir, "views.json");
    this.shortlistPath = path.join(this.configDir, "shortlist.json");
    this.queue = Promise.resolve();
  }

  async init() {
    await ensureDir(this.sessionsDir);
    await ensureDir(this.configDir);

    // Keep the synced files present so git add never fails on a fresh workspace.
    try {
      await fs.access(this.viewsPath);
    } catch {
      await this.writeViews(defaultViews());
    }
    try {
      await fs.access(this.shortlistPath);
    } catch {
      await this.writeShortlist({ schemaVersion: 1, items: {} });
    }
  }

  enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  legacyPath(id) {
    if (!SESSION_ID_RE.test(String(id ?? ""))) {
      throw new Error("That engagement id doesn't look right.");
    }
    return path.join(this.sessionsDir, `${id}.json`);
  }

  async readSettings() {
    try {
      return normaliseSettings(await readJson(this.settingsPath));
    } catch {
      return normaliseSettings(null);
    }
  }

  async writeSettings(settings) {
    return this.enqueue(async () => {
      const clean = normaliseSettings(settings);
      await atomicWrite(this.settingsPath, JSON.stringify(clean, null, 2) + "\n");
      return clean;
    });
  }

  async setPrefs(prefs) {
    const current = await this.readSettings();
    return this.writeSettings({ ...current, prefs: { ...current.prefs, ...prefs } });
  }

  bountyPath(source) {
    return source === "hackerone"
      ? this.bountiesPath
      : path.join(this.configDir, `bounties-${source}.json`);
  }

  async readBountyCache(source = "hackerone") {
    try {
      return normaliseBountyCache(
        await readJson(this.bountyPath(source)),
        source,
      );
    } catch {
      return emptyBountyCache(source);
    }
  }

  async writeBountyCache(cache) {
    return this.enqueue(async () => {
      const clean = normaliseBountyCache(cache, cache?.source);
      await atomicWrite(
        this.bountyPath(clean.source),
        JSON.stringify(clean, null, 2) + "\n",
      );
      return clean;
    });
  }

  async readViews() {
    try {
      return normaliseViews(await readJson(this.viewsPath));
    } catch {
      return defaultViews();
    }
  }

  async writeViews(views) {
    return this.enqueue(async () => {
      const clean = normaliseViews(views);
      await atomicWrite(this.viewsPath, JSON.stringify(clean, null, 2) + "\n");
      return clean;
    });
  }

  async readShortlist() {
    try {
      return normaliseShortlist(await readJson(this.shortlistPath));
    } catch {
      return { schemaVersion: 1, items: {} };
    }
  }

  async writeShortlist(shortlist) {
    return this.enqueue(async () => {
      const clean = normaliseShortlist(shortlist);
      await atomicWrite(this.shortlistPath, JSON.stringify(clean, null, 2) + "\n");
      return clean;
    });
  }

  async setShortlist(id, patch) {
    const current = await this.readShortlist();
    const key = String(id ?? "");
    if (!key) throw new Error("That bounty is missing an id.");
    const status = STATUSES.includes(patch?.status) ? patch.status : "interested";
    current.items[key] = {
      id: key,
      status,
      note: typeof patch?.note === "string" ? patch.note.slice(0, 4000) : "",
      savedAt: nowIso(),
    };
    return this.writeShortlist(current);
  }

  async removeShortlist(id) {
    const current = await this.readShortlist();
    delete current.items[String(id ?? "")];
    return this.writeShortlist(current);
  }

  /**
   * Safety copy of the two synced data files, taken immediately before an app
   * update installs. The updater does not touch the workspace, but a local copy
   * makes that guarantee visible and recoverable.
   */
  async backupSyncedData() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(this.configDir, "backups", stamp);
    await ensureDir(dir);
    for (const file of ["views.json", "shortlist.json"]) {
      try {
        await fs.copyFile(path.join(this.configDir, file), path.join(dir, file));
      } catch {
        // A missing file simply has nothing to back up.
      }
    }
    return dir;
  }

  async listLegacy() {
    let entries = [];
    try {
      entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const out = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -".json".length);
      if (!SESSION_ID_RE.test(id)) continue;
      try {
        const session = await readJson(path.join(this.sessionsDir, entry.name));
        if (!session || session.id !== id) continue;
        out.push({
          id,
          name: typeof session.name === "string" ? session.name : "Untitled engagement",
          endpointCount:
            Number.isFinite(session.stats?.ingested) && session.stats.ingested > 0
              ? session.stats.ingested
              : Array.isArray(session.endpoints)
                ? session.endpoints.length
                : 0,
          updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : nowIso(),
        });
      } catch {
        // Corrupt or mid-move files are skipped rather than breaking the list.
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  }

  async archiveLegacy(id) {
    const source = this.legacyPath(id);
    await ensureDir(this.archiveDir);
    let target = path.join(this.archiveDir, `${id}.json`);
    try {
      await fs.access(target);
      target = path.join(this.archiveDir, `${id}-${Date.now()}.json`);
    } catch {
      // No existing archive copy.
    }
    await fs.rename(source, target);
    return true;
  }

  async deleteLegacy(id) {
    await fs.unlink(this.legacyPath(id));
    return true;
  }

  async archiveAllLegacy() {
    const metas = await this.listLegacy();
    for (const meta of metas) {
      await this.archiveLegacy(meta.id).catch(() => {});
    }
    return this.listLegacy();
  }

  async deleteAllLegacy() {
    const metas = await this.listLegacy();
    for (const meta of metas) {
      await this.deleteLegacy(meta.id).catch(() => {});
    }
    return this.listLegacy();
  }
}
