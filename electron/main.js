import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { Store } from "./lib/store.js";
import { AppUpdater } from "./lib/updates.js";
import { fetchPage } from "./lib/fetchPage.js";
import { applyBountyView, normaliseFilters, normaliseSort } from "./lib/bountyFilters.js";
import {
  HACKERONE_DIRECTORY_URL,
  MAX_PAGES,
  bountiesToCsv,
  hackerOneRequest,
  normaliseBugcrowd,
  normaliseHackerOne,
  normaliseYesWeHack,
  validateSourceUrl,
} from "./lib/bounties.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PKG_VERSION = require("../package.json").version;
const APP_VERSION = app.isPackaged ? app.getVersion() : PKG_VERSION;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const PROGRESS_CHANNEL = "bounties:progress";
const PAGE_DELAY_MS = 120;

app.setName("Shrike");

let win = null;
let store = null;
let updater = null;
let quitting = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function resolveWorkspace() {
  if (process.env.SHRIKE_WORKSPACE) return path.resolve(process.env.SHRIKE_WORKSPACE);
  if (app.isPackaged) return path.join(app.getPath("documents"), "Shrike");
  return path.join(ROOT, ".shrike-workspace");
}

async function buildBootstrap(activeId) {
  const [settings, hackerone, bugcrowd, yeswehack, views, shortlist, legacy] =
    await Promise.all([
      store.readSettings(),
      store.readBountyCache("hackerone"),
      store.readBountyCache("bugcrowd"),
      store.readBountyCache("yeswehack"),
      store.readViews(),
      store.readShortlist(),
      store.listLegacy(),
    ]);

  return {
    version: APP_VERSION,
    settings,
    bounties: { hackerone, bugcrowd, yeswehack },
    views,
    shortlist,
    legacy,
    update: updater.getState(),
    paths: {
      workspace: store.workspace,
      config: store.configDir,
    },
    initialView: process.env.SHRIKE_INITIAL_VIEW || null,
  };
}

async function fetchKind(kind, onPage) {
  let cursor = null;
  let page = 0;
  let total = null;
  const programs = [];

  for (;;) {
    page += 1;
    if (page > MAX_PAGES) {
      throw new Error("HackerOne returned more pages than expected. Try again later.");
    }

    const request = hackerOneRequest({ cursor, kind });
    const response = await fetchPage(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://hackerone.com",
        referer: HACKERONE_DIRECTORY_URL,
      },
      body: JSON.stringify(request.body),
    });

    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new Error("HackerOne returned a response Shrike could not read.");
    }

    const result = normaliseHackerOne(payload);
    programs.push(...result.programs);
    if (total == null) total = result.total;
    onPage?.({ page, loaded: programs.length, total: total ?? programs.length });

    if (!result.hasNext || !result.cursor) break;
    cursor = result.cursor;
    await delay(PAGE_DELAY_MS);
  }

  return { programs, total: total ?? programs.length, pages: page };
}

async function fetchHackerOne(onProgress) {
  broadcast(PROGRESS_CHANNEL, {
    phase: "bounty",
    source: "hackerone",
    page: 1,
    loaded: 0,
    total: 0,
  });

  const bounties = await fetchKind("bounty", (progress) => {
    onProgress({
      phase: "bounty",
      source: "hackerone",
      page: progress.page,
      loaded: progress.loaded,
      total: progress.total,
    });
  });

  const vdps = await fetchKind("vdp", (progress) => {
    onProgress({
      phase: "vdp",
      source: "hackerone",
      page: progress.page,
      loaded: bounties.programs.length + progress.loaded,
      total: bounties.total + progress.total,
    });
  });

  return [...bounties.programs, ...vdps.programs];
}

async function fetchBugcrowdCategory(category, onProgress, offset, baseTotal) {
  let page = 1;
  let total = null;
  const programs = [];

  for (;;) {
    if (page > MAX_PAGES) throw new Error("Bugcrowd returned more pages than expected.");
    const response = await fetchPage(
      `https://bugcrowd.com/engagements.json?category=${category}&page=${page}`,
      { headers: { accept: "application/json" } },
    );
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new Error("Bugcrowd returned a response Shrike could not read.");
    }

    const result = normaliseBugcrowd(payload);
    programs.push(...result.programs);
    if (total == null) total = result.total;

    onProgress({
      phase: "programs",
      source: "bugcrowd",
      page,
      loaded: offset + programs.length,
      total: (baseTotal ?? 0) + (total ?? programs.length),
    });

    const limit = Number(payload?.paginationMeta?.limit) || 24;
    if (!result.programs.length || page * limit >= (total ?? programs.length)) break;
    page += 1;
    await delay(PAGE_DELAY_MS);
  }

  return { programs, total: total ?? programs.length };
}

async function fetchBugcrowd(onProgress) {
  const bounties = await fetchBugcrowdCategory("bug_bounty", onProgress, 0, 0);
  const vdps = await fetchBugcrowdCategory(
    "vdp",
    onProgress,
    bounties.programs.length,
    bounties.total,
  );
  return [...bounties.programs, ...vdps.programs];
}

async function fetchYesWeHack(onProgress) {
  let page = 1;
  let total = null;
  let pages = 1;
  const programs = [];

  for (;;) {
    if (page > MAX_PAGES) throw new Error("YesWeHack returned more pages than expected.");
    const response = await fetchPage(`https://api.yeswehack.com/programs?page=${page}`, {
      headers: { accept: "application/json" },
    });
    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new Error("YesWeHack returned a response Shrike could not read.");
    }

    const result = normaliseYesWeHack(payload);
    programs.push(...result.programs);
    if (total == null) total = result.total;
    pages = result.pages || 1;

    onProgress({
      phase: "programs",
      source: "yeswehack",
      page,
      loaded: programs.length,
      total: total ?? programs.length,
    });

    if (page >= pages || !result.programs.length) break;
    page += 1;
    await delay(PAGE_DELAY_MS);
  }

  return programs;
}

async function fetchSource(source, onProgress) {
  const programs = await (source === "bugcrowd"
    ? fetchBugcrowd(onProgress)
    : source === "yeswehack"
      ? fetchYesWeHack(onProgress)
      : fetchHackerOne(onProgress));

  const seen = new Set();
  const unique = [];
  for (const program of programs) {
    if (seen.has(program.id)) continue;
    seen.add(program.id);
    unique.push(program);
  }

  broadcast(PROGRESS_CHANNEL, {
    phase: "done",
    source,
    page: 0,
    loaded: unique.length,
    total: unique.length,
  });

  return {
    schemaVersion: 1,
    source,
    fetchedAt: new Date().toISOString(),
    scanned: unique.length,
    programs: unique,
  };
}

function registerIpc() {
  handle("app:bootstrap", (activeId) => buildBootstrap(activeId));

  handle("app:open-workspace", async () => {
    const error = await shell.openPath(store.workspace);
    if (error) throw new Error(error);
    return true;
  });

  handle("app:open-external", async (url) => {
    const parsed = validateSourceUrl(url);
    await shell.openExternal(parsed.url);
    return true;
  });

  handle("bounties:list", (source) => store.readBountyCache(source || "hackerone"));

  handle("bounties:refresh", async (source) => {
    const chosen = ["hackerone", "bugcrowd", "yeswehack"].includes(source)
      ? source
      : "hackerone";
    const cache = await fetchSource(chosen, (progress) =>
      broadcast(PROGRESS_CHANNEL, progress),
    );
    await store.writeBountyCache(cache);
    broadcast("bounties:changed", cache);
    return cache;
  });

  handle("settings:set-prefs", async (prefs) => {
    const settings = await store.setPrefs(prefs);
    if (typeof prefs?.autoCheckUpdates === "boolean") {
      updater.setAutoCheck(settings.prefs.autoCheckUpdates);
    }
    return { settings };
  });

  handle("views:save", (views) => store.writeViews(views));

  handle("shortlist:set", ({ id, status, note } = {}) =>
    store.setShortlist(id, { status, note }),
  );

  handle("shortlist:remove", (id) => store.removeShortlist(id));

  handle("legacy:list", () => store.listLegacy());
  handle("legacy:archive", async (id) => {
    await store.archiveLegacy(id);
    return store.listLegacy();
  });
  handle("legacy:delete", async (id) => {
    await store.deleteLegacy(id);
    return store.listLegacy();
  });
  handle("legacy:archive-all", () => store.archiveAllLegacy());
  handle("legacy:delete-all", () => store.deleteAllLegacy());

  handle("update:state", () => updater.getState());
  handle("update:check", () => updater.check());
  handle("update:download", () => updater.download());
  handle("update:install", async () => {
    await store.backupSyncedData();
    return updater.install();
  });

  handle("export:csv", async ({ source, filters, sort } = {}) => {
    const chosen = ["hackerone", "bugcrowd", "yeswehack"].includes(source)
      ? source
      : "hackerone";
    const [cache, shortlist] = await Promise.all([
      store.readBountyCache(chosen),
      store.readShortlist(),
    ]);
    const rows = applyBountyView(
      cache.programs,
      normaliseFilters(filters),
      normaliseSort(sort),
      new Set(Object.keys(shortlist.items)),
    );
    if (!rows.length) {
      throw new Error("There are no bounties in the current view to export.");
    }

    const result = await dialog.showSaveDialog(win, {
      title: "Export bounties",
      defaultPath: `shrike-${chosen}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) return null;

    await fs.writeFile(result.filePath, "\uFEFF" + bountiesToCsv(rows), "utf8");
    return { filePath: result.filePath, count: rows.length };
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#09090b",
    show: true,
    autoHideMenuBar: true,
    title: "Shrike",
    icon: app.isPackaged ? undefined : path.join(ROOT, "build", "icon.png"),
    webPreferences: {
      preload: path.join(ROOT, "electron", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(ROOT, "dist", "index.html")).catch(() => {
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            '<body style="background:#09090b;color:#d8dee0;font:14px monospace;padding:40px">' +
              "Renderer build missing.<br><br>Run <b>npm run build</b> and start again.</body>",
          ),
      );
    });
  }

  if (process.env.SHRIKE_SCREENSHOT) {
    void captureAndQuit();
  }
}

async function captureAndQuit() {
  const out = process.env.SHRIKE_SCREENSHOT;
  try {
    for (let i = 0; i < 80; i += 1) {
      const ready = await win.webContents
        .executeJavaScript("document.documentElement.dataset.ready === '1'")
        .catch(() => false);
      if (ready) break;
      await delay(250);
    }
    await delay(700);

    if (process.env.SHRIKE_CHECK_UPDATES) {
      await updater.check().catch(() => {});
      if (process.env.SHRIKE_DOWNLOAD_UPDATE) {
        await updater.download().catch(() => {});
      }
      await delay(3000);
      console.log("update state", JSON.stringify(updater.getState()));
    }

    const image = await win.webContents.capturePage();
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, image.toPNG());
  } catch (err) {
    console.error("screenshot failed", err);
  } finally {
    app.quit();
  }
}

async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  Menu.setApplicationMenu(null);
  if (process.platform === "win32") app.setAppUserModelId("dev.shrike.desktop");

  const workspace = resolveWorkspace();
  await fs.mkdir(workspace, { recursive: true });

  store = new Store(workspace);
  await store.init();

  const settings = await store.readSettings();

  updater = new AppUpdater({
    autoCheck: settings.prefs.autoCheckUpdates,
    onStatus: (state) => broadcast("update:status", state),
  });
  updater.init();

  registerIpc();
  createWindow();
  updater.scheduleAutoCheck();
}

app.whenReady().then(start).catch((err) => {
  console.error("Shrike failed to start", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  quitting = true;
});
