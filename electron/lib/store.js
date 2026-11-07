import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { defaultRules, normaliseRules, rulesHash } from "./rules.js";
import {
  computeStats,
  emptySession,
  ingestIntoSession,
  rescoreSession,
} from "./ingest.js";

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/** Write via temp file + fsync + atomic rename. A half-written session is never visible. */
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

export class Store {
  constructor(workspace) {
    this.workspace = workspace;
    this.sessionsDir = path.join(workspace, "sessions");
    this.configDir = path.join(workspace, "config");
    this.settingsPath = path.join(this.configDir, "settings.json");
    this.gitStatePath = path.join(this.configDir, "git-state.json");
    this.queue = Promise.resolve();
  }

  async init() {
    await ensureDir(this.sessionsDir);
    await ensureDir(this.configDir);
  }

  enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  sessionPath(id) {
    if (!SESSION_ID_RE.test(String(id ?? ""))) {
      throw new Error("Invalid session id");
    }
    return path.join(this.sessionsDir, `${id}.json`);
  }

  async readSettings() {
    let raw = null;
    try {
      raw = await readJson(this.settingsPath);
    } catch {
      raw = null;
    }
    return {
      schemaVersion: 1,
      rules: raw?.rules ? normaliseRules(raw.rules) : defaultRules(),
      sync: {
        autoPush: raw?.sync?.autoPush !== false,
      },
    };
  }

  async writeSettings(settings) {
    return this.enqueue(async () => {
      const clean = {
        schemaVersion: 1,
        rules: normaliseRules(settings.rules),
        sync: { autoPush: settings.sync?.autoPush !== false },
      };
      await atomicWrite(this.settingsPath, JSON.stringify(clean, null, 2) + "\n");
      return clean;
    });
  }

  async setRules(rules) {
    const current = await this.readSettings();
    return this.writeSettings({ ...current, rules });
  }

  async setAutoPush(enabled) {
    const current = await this.readSettings();
    return this.writeSettings({ ...current, sync: { autoPush: Boolean(enabled) } });
  }

  async readGitState() {
    try {
      const raw = await readJson(this.gitStatePath);
      return { lastSyncAt: typeof raw?.lastSyncAt === "string" ? raw.lastSyncAt : null };
    } catch {
      return { lastSyncAt: null };
    }
  }

  async writeGitState(state) {
    await atomicWrite(this.gitStatePath, JSON.stringify(state, null, 2) + "\n");
  }

  async listSessions() {
    let entries = [];
    try {
      entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const metas = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -".json".length);
      if (!SESSION_ID_RE.test(id)) continue;
      try {
        const session = await readJson(path.join(this.sessionsDir, entry.name));
        // A file whose payload disagrees with its filename is not trustworthy.
        if (!session || session.id !== id) continue;
        metas.push(this.toMeta(session));
      } catch {
        // Corrupt or mid-move file: skip rather than break the whole list.
      }
    }

    metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return metas;
  }

  toMeta(session) {
    const stats = session.stats ?? computeStats({}, []);
    return {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      endpointCount: stats.ingested ?? 0,
      keptCount: stats.kept ?? 0,
      filteredCount: stats.filtered ?? 0,
      maxScore: stats.maxScore ?? 0,
      rulesHash: session.rulesHash ?? rulesHash(session.rulesSnapshot ?? defaultRules()),
    };
  }

  async readSession(id) {
    const file = this.sessionPath(id);
    const session = await readJson(file);
    if (!session || typeof session !== "object" || !Array.isArray(session.endpoints)) {
      throw new Error("Session file is not a valid Shrike session");
    }
    if (session.id !== id) {
      throw new Error("Session file id does not match its filename");
    }
    return session;
  }

  async writeSession(session) {
    return this.enqueue(async () => {
      const clean = { ...session, updatedAt: nowIso() };
      await atomicWrite(this.sessionPath(clean.id), JSON.stringify(clean, null, 2) + "\n");
      return clean;
    });
  }

  async createSession(name) {
    const settings = await this.readSettings();
    const session = emptySession(
      crypto.randomUUID(),
      (name && String(name).trim().slice(0, 80)) || "Untitled session",
      settings.rules,
      nowIso(),
    );
    return this.writeSession(session);
  }

  async renameSession(id, name) {
    return this.enqueue(async () => {
      const session = await this.readSession(id);
      session.name = String(name ?? "").trim().slice(0, 80) || session.name;
      session.updatedAt = nowIso();
      await atomicWrite(this.sessionPath(id), JSON.stringify(session, null, 2) + "\n");
      return session;
    });
  }

  async deleteSession(id) {
    return this.enqueue(async () => {
      await fs.unlink(this.sessionPath(id));
    });
  }

  async ingest(id, raw, mode, sourceName) {
    const settings = await this.readSettings();
    const session = await this.readSession(id);
    const updated = ingestIntoSession(session, raw, mode, settings.rules, sourceName, nowIso());
    return this.writeSession(updated);
  }

  async rescore(id) {
    const settings = await this.readSettings();
    const session = await this.readSession(id);
    const updated = rescoreSession(session, settings.rules, nowIso());
    return this.writeSession(updated);
  }

  async rescoreAll() {
    const settings = await this.readSettings();
    const metas = await this.listSessions();
    const updated = [];
    for (const meta of metas) {
      try {
        const session = await this.readSession(meta.id);
        updated.push(await this.writeSession(rescoreSession(session, settings.rules, nowIso())));
      } catch {
        // Skip unreadable sessions rather than aborting the batch.
      }
    }
    return updated;
  }
}
