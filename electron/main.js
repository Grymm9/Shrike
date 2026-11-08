import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Store } from "./lib/store.js";
import { GitSync, delay } from "./lib/git.js";
import { AppUpdater } from "./lib/updates.js";
import { fetchPage } from "./lib/fetchPage.js";
import { applyBountyView, normaliseFilters, normaliseSort } from "./lib/bountyFilters.js";
import {
  HACKERONE_DIRECTORY_URL,
  MAX_PAGES,
  bountiesToCsv,
  hackerOneRequest,
  normaliseHackerOne,
  validateSourceUrl,
} from "./lib/bounties.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const PROGRESS_CHANNEL = "bounties:progress";
const PAGE_DELAY_MS = 120;

app.setName("Shrike");

let win = null;
let store = null;
let git = null;
let updater = null;
let quitting = false;

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
  // Keep development data out of the source tree.
  return path.join(ROOT, ".shrike-workspace");
}

async function buildBootstrap(activeId) {
  const [settings, bounties, views, shortlist, legacy] = await Promise.all([
    store.readSettings(),
    store.readBountyCache(),
    store.readViews(),
    store.readShortlist(),
    store.listLegacy(),
  ]);

  return {
    version: app.getVersion(),
    settings,
    bounties,
    views,
    shortlist,
    legacy,
    git: git.getState(),
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

async function fetchDirectory() {
  broadcast(PROGRESS_CHANNEL, {
    phase: "bounty",
    page: 1,
    loaded: 0,
    total: 0,
  });

  const bounties = await fetchKind("bounty", (progress) => {
    broadcast(PROGRESS_CHANNEL, {
      phase: "bounty",
      page: progress.page,
      loaded: progress.loaded,
      total: progress.total,
    });
  });

  const vdps = await fetchKind("vdp", (progress) => {
    broadcast(PROGRESS_CHANNEL, {
      phase: "vdp",
      page: progress.page,
      loaded: bounties.programs.length + progress.loaded,
      total: bounties.total + progress.total,
    });
  });

  const combined = [...bounties.programs, ...vdps.programs];
  const seen = new Set();
  const programs = [];
  for (const program of combined) {
    if (seen.has(program.id)) continue;
    seen.add(program.id);
    programs.push(program);
  }

  broadcast(PROGRESS_CHANNEL, {
    phase: "done",
    page: bounties.pages + vdps.pages,
    loaded: programs.length,
    total: programs.length,
  });

  return {
    schemaVersion: 1,
    source: "hackerone",
    fetchedAt: new Date().toISOString(),
    scanned: programs.length,
    programs,
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

  handle("bounties:list", () => store.readBountyCache());

  handle("bounties:refresh", async () => {
    const cache = await fetchDirectory();
    await store.writeBountyCache(cache);
    broadcast("bounties:changed", cache);
    return cache;
  });

  handle("settings:set-autopush", async (enabled) => {
    const settings = await store.setAutoPush(Boolean(enabled));
    git.setAutoPush(settings.sync.autoPush);
    return { settings, git: git.getState() };
  });

  handle("settings:set-prefs", async (prefs) => {
    const settings = await store.setPrefs(prefs);
    if (typeof prefs?.autoCheckUpdates === "boolean") {
      updater.setAutoCheck(settings.prefs.autoCheckUpdates);
    }
    return { settings };
  });

  handle("update:state", () => updater.getState());
  handle("update:check", () => updater.check());
  handle("update:download", () => updater.download());
  handle("update:install", async () => {
    await store.backupSyncedData();
    return updater.install();
  });

  handle("views:save", async (views) => {
    const saved = await store.writeViews(views);
    git.schedulePush("shrike: update saved views");
    return saved;
  });

  handle("shortlist:set", async ({ id, status, note } = {}) => {
    const shortlist = await store.setShortlist(id, { status, note });
    git.schedulePush("shrike: update shortlist");
    return shortlist;
  });

  handle("shortlist:remove", async (id) => {
    const shortlist = await store.removeShortlist(id);
    git.schedulePush("shrike: update shortlist");
    return shortlist;
  });

  handle("sync:push", async () => {
    const state = await git.pushNow("shrike: manual push");
    return { git: state };
  });

  handle("sync:pull", async () => {
    const state = await git.pullNow();
    const [views, shortlist, legacy] = await Promise.all([
      store.readViews(),
      store.readShortlist(),
      store.listLegacy(),
    ]);
    broadcast("data:changed", { views, shortlist });
    return { git: state, views, shortlist, legacy };
  });

  handle("sync:set-remote", async (url) => {
    const state = await git.setRemote(url);
    return { git: state };
  });

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

  handle("export:csv", async ({ filters, sort } = {}) => {
    const [cache, shortlist] = await Promise.all([
      store.readBountyCache(),
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
      defaultPath: "shrike-bounties.csv",
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
    backgroundColor: "#0b0d0e",
    show: true,
    autoHideMenuBar: true,
    title: "Shrike",
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
            '<body style="background:#0b0d0e;color:#d8dee0;font:14px monospace;padding:40px">' +
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

    // Screenshot-only hook: exercise a real update check from the packaged app.
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
  const gitState = await store.readGitState();

  let lastPersistedSync = gitState.lastSyncAt;
  git = new GitSync({
    repo: workspace,
    autoPush: settings.sync.autoPush,
    lastSyncAt: gitState.lastSyncAt,
    onStatus: (state) => {
      broadcast("sync:status", state);
      if (state.lastSyncAt && state.lastSyncAt !== lastPersistedSync) {
        lastPersistedSync = state.lastSyncAt;
        store.writeGitState({ lastSyncAt: state.lastSyncAt }).catch(() => {});
      }
    },
  });

  updater = new AppUpdater({
    autoCheck: settings.prefs.autoCheckUpdates,
    onStatus: (state) => broadcast("update:status", state),
  });
  updater.init();

  registerIpc();
  await git.init();
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

app.on("before-quit", (event) => {
  if (quitting) return;
  if (!git) return;
  event.preventDefault();
  quitting = true;
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
  Promise.race([git.flush().catch(() => {}), timeout]).finally(() => app.quit());
});
