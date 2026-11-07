import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Store } from "../electron/lib/store.js";
import { normaliseRules } from "../electron/lib/rules.js";

const cleanups: string[] = [];

async function workspace(prefix = "shrike-store-"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanups.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("Store", () => {
  it("creates, ingests, renames, re-scores and deletes a session", async () => {
    const dir = await workspace();
    const store = new Store(dir);
    await store.init();

    const settings = await store.readSettings();
    expect(settings.rules.weights.base).toBeGreaterThan(0);
    expect(settings.sync.autoPush).toBe(true);

    const created = await store.createSession("  Acme  ");
    expect(created.name).toBe("Acme");
    expect(created.endpoints).toHaveLength(0);
    expect(store.sessionPath(created.id)).toBe(
      path.join(dir, "sessions", `${created.id}.json`),
    );

    const onDisk = JSON.parse(await fs.readFile(store.sessionPath(created.id), "utf8"));
    expect(onDisk.id).toBe(created.id);
    expect(onDisk.rulesHash).toBe(created.rulesHash);

    const ingested = await store.ingest(
      created.id,
      "/api/orders/1042\n/static/app.css\n/health",
      "replace",
      "recon.txt",
    );
    expect(ingested.stats).toMatchObject({ ingested: 3, kept: 1, filtered: 2 });
    expect(ingested.source).toMatchObject({ kind: "file", name: "recon.txt" });

    const metas = await store.listSessions();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ id: created.id, endpointCount: 3, keptCount: 1 });

    await store.setRules(
      normaliseRules({
        ...settings.rules,
        ignoredExtensions: [],
        ignoredSegments: [],
      }),
    );
    const rescored = await store.rescore(created.id);
    expect(rescored.stats.kept).toBe(3);

    const renamed = await store.renameSession(created.id, "Acme v2");
    expect(renamed.name).toBe("Acme v2");

    await store.deleteSession(created.id);
    await expect(store.readSession(created.id)).rejects.toThrow();
    expect(await store.listSessions()).toEqual([]);
  });

  it("rejects ids that could escape the sessions directory", async () => {
    const dir = await workspace();
    const store = new Store(dir);
    await store.init();

    for (const id of ["../evil", "..\\evil", "not-a-uuid", "abc/def"]) {
      await expect(store.readSession(id)).rejects.toThrow(/invalid session id/i);
    }
  });

  it("skips corrupt and mismatched session files instead of failing the list", async () => {
    const dir = await workspace();
    const store = new Store(dir);
    await store.init();

    const good = await store.createSession("Healthy");
    await store.ingest(good.id, "/api/users/7", "replace", null);

    await fs.writeFile(path.join(store.sessionsDir, "broken.json"), "{not json", "utf8");

    const foreignId = "11111111-2222-4333-8444-555555555555";
    const foreign = JSON.parse(await fs.readFile(store.sessionPath(good.id), "utf8"));
    await fs.writeFile(
      path.join(store.sessionsDir, `${foreignId}.json`),
      JSON.stringify({ ...foreign, id: good.id }),
      "utf8",
    );

    const metas = await store.listSessions();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe(good.id);
    await expect(store.readSession(foreignId)).rejects.toThrow(/does not match/i);
  });

  it("splits append imports and keeps counters accumulating", async () => {
    const dir = await workspace();
    const store = new Store(dir);
    await store.init();
    const session = await store.createSession("Append");

    await store.ingest(session.id, "/api/orders/1", "replace", null);
    const appended = await store.ingest(
      session.id,
      "/api/orders/1\n/api/orders/2",
      "append",
      null,
    );

    expect(appended.stats.ingested).toBe(2);
    expect(appended.stats.duplicates).toBe(1);
    expect(appended.endpoints).toHaveLength(2);
  });
});
