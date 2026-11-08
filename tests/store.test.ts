import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Store } from "../electron/lib/store.js";
import { emptyFilters } from "../electron/lib/bountyFilters.js";

const cleanups: string[] = [];

async function workspace(): Promise<Store> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shrike-store-"));
  cleanups.push(dir);
  const store = new Store(dir);
  await store.init();
  return store;
}

afterEach(async () => {
  for (const dir of cleanups.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("Store", () => {
  it("creates the synced files and default settings", async () => {
    const store = await workspace();
    const settings = await store.readSettings();
    expect(settings).toMatchObject({
      schemaVersion: 2,
      sync: { autoPush: true },
      prefs: { cacheMinutes: 15, defaultSort: "maxBounty", defaultViewId: null },
    });

    const views = await store.readViews();
    expect(views.views.map((view) => view.id)).toEqual([
      "high-payout",
      "new-programs",
      "vdp",
    ]);

    const shortlist = await store.readShortlist();
    expect(shortlist.items).toEqual({});

    await fs.access(path.join(store.configDir, "views.json"));
    await fs.access(path.join(store.configDir, "shortlist.json"));
  });

  it("persists preferences without losing sync settings", async () => {
    const store = await workspace();
    await store.setAutoPush(false);
    const updated = await store.setPrefs({ defaultSort: "name", defaultViewId: "vdp" });
    expect(updated.sync.autoPush).toBe(false);
    expect(updated.prefs.defaultSort).toBe("name");
    expect(updated.prefs.defaultViewId).toBe("vdp");

    const reread = await store.readSettings();
    expect(reread.prefs.defaultSort).toBe("name");
  });

  it("saves, updates and deletes views", async () => {
    const store = await workspace();
    const saved = await store.writeViews({
      schemaVersion: 1,
      views: [
        {
          id: "cheap",
          name: "Cheap and new",
          filters: { ...emptyFilters(), query: "cloud" },
          sort: "launched",
        },
        { id: "", name: "Invalid", filters: emptyFilters(), sort: "maxBounty" },
      ],
    });

    expect(saved.views).toHaveLength(1);
    expect(saved.views[0]).toMatchObject({
      id: "cheap",
      name: "Cheap and new",
      sort: "launched",
    });
    expect(saved.views[0].filters.query).toBe("cloud");
    expect(saved.views[0].filters.minBounty).toBeNull();

    const reread = await store.readViews();
    expect(reread.views).toHaveLength(1);
  });

  it("stores shortlist status and notes", async () => {
    const store = await workspace();
    let shortlist = await store.setShortlist("hackerone:shopify", {
      status: "interested",
      note: "Check GraphQL scope",
    });
    expect(shortlist.items["hackerone:shopify"]).toMatchObject({
      status: "interested",
      note: "Check GraphQL scope",
    });

    shortlist = await store.setShortlist("hackerone:shopify", {
      status: "working",
      note: "Testing payments flow",
    });
    expect(shortlist.items["hackerone:shopify"].status).toBe("working");
    expect(shortlist.items["hackerone:shopify"].note).toBe("Testing payments flow");

    shortlist = await store.removeShortlist("hackerone:shopify");
    expect(shortlist.items).toEqual({});
  });

  it("backs up views and shortlist before an update", async () => {
    const store = await workspace();
    await store.writeViews({
      schemaVersion: 1,
      views: [
        {
          id: "mine",
          name: "Mine",
          filters: emptyFilters(),
          sort: "reports",
        },
      ],
    });
    await store.setShortlist("hackerone:shopify", {
      status: "working",
      note: "keep me",
    });

    const dir = await store.backupSyncedData();
    const views = JSON.parse(await fs.readFile(path.join(dir, "views.json"), "utf8"));
    const shortlist = JSON.parse(await fs.readFile(path.join(dir, "shortlist.json"), "utf8"));
    expect(views.views[0].name).toBe("Mine");
    expect(shortlist.items["hackerone:shopify"].note).toBe("keep me");
  });

  it("round-trips the bounty cache and falls back to empty", async () => {
    const store = await workspace();
    const written = await store.writeBountyCache({
      schemaVersion: 1,
      source: "hackerone",
      fetchedAt: "2026-11-08T12:00:00.000Z",
      scanned: 1,
      programs: [
        {
          id: "hackerone:shopify",
          source: "hackerone",
          handle: "shopify",
          name: "Shopify",
          url: "https://hackerone.com/shopify",
          platform: "HackerOne",
          description: null,
          currency: "USD",
          minBounty: 500,
          maxBounty: 50000,
          averageBounty: 2000,
          reports: 2530,
          responseEfficiency: 93,
          launchedAt: "2016-03-01T00:00:00.000Z",
          type: "bounty",
          tags: [],
        },
      ],
    });
    expect(written.scanned).toBe(1);

    const reread = await store.readBountyCache();
    expect(reread.programs[0].name).toBe("Shopify");

    await fs.writeFile(store.bountiesPath, "{not json", "utf8");
    const fallback = await store.readBountyCache();
    expect(fallback.programs).toEqual([]);
  });

  it("lists, archives and deletes legacy engagement files", async () => {
    const store = await workspace();
    const keep = crypto.randomUUID();
    const drop = crypto.randomUUID();
    const old = (id: string, name: string, ingested: number) =>
      JSON.stringify({
        id,
        name,
        updatedAt: "2025-01-01T00:00:00.000Z",
        stats: { ingested },
        endpoints: [],
      });

    await fs.writeFile(path.join(store.sessionsDir, `${keep}.json`), old(keep, "Acme", 12));
    await fs.writeFile(path.join(store.sessionsDir, `${drop}.json`), old(drop, "Globex", 3));

    const listed = await store.listLegacy();
    expect(listed).toHaveLength(2);
    expect(listed.map((item) => item.name).sort()).toEqual(["Acme", "Globex"]);
    expect(listed.find((item) => item.name === "Acme")?.endpointCount).toBe(12);

    await store.archiveLegacy(drop);
    await fs.access(path.join(store.archiveDir, `${drop}.json`));
    await expect(fs.access(path.join(store.sessionsDir, `${drop}.json`))).rejects.toThrow();

    const remaining = await store.listLegacy();
    expect(remaining.map((item) => item.name)).toEqual(["Acme"]);

    await store.deleteLegacy(keep);
    expect(await store.listLegacy()).toEqual([]);
  });

  it("archives every legacy file at once", async () => {
    const store = await workspace();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids) {
      await fs.writeFile(
        path.join(store.sessionsDir, `${id}.json`),
        JSON.stringify({ id, name: id, updatedAt: new Date().toISOString(), endpoints: [] }),
      );
    }
    expect(await store.archiveAllLegacy()).toEqual([]);
    const archived = await fs.readdir(store.archiveDir);
    expect(archived.sort()).toEqual(ids.map((id) => `${id}.json`).sort());
  });
});
