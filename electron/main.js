import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Store } from "./lib/store.js";
import { GitSync, delay } from "./lib/git.js";
import { defaultRules } from "./lib/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const MAX_RAW_BYTES = 20_000_000;

app.setName("Shrike");

let win = null;
let store = null;
let git = null;
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
  // Keep development sessions out of the source tree: the dev workspace is its
  // own git repo, exactly like the packaged app's Documents folder.
  return path.join(ROOT, ".shrike-workspace");
}

async function buildBootstrap(activeId) {
  const settings = await store.readSettings();
  const sessions = await store.listSessions();

  let activeSession = null;
  const target = activeId || sessions[0]?.id;
  if (target) {
    try {
      activeSession = await store.readSession(target);
    } catch {
      activeSession = null;
    }
  }

  return {
    settings,
    sessions,
    activeSession,
    git: git.getState(),
    paths: {
      workspace: store.workspace,
      sessions: store.sessionsDir,
      config: store.configDir,
    },
    initialView: process.env.SHRIKE_INITIAL_VIEW || null,
  };
}

function registerIpc() {
  handle("app:bootstrap", (activeId) => buildBootstrap(activeId));

  handle("app:open-sessions", async () => {
    const error = await shell.openPath(store.sessionsDir);
    if (error) throw new Error(error);
    return true;
  });

  handle("app:open-workspace", async () => {
    const error = await shell.openPath(store.workspace);
    if (error) throw new Error(error);
    return true;
  });

  handle("settings:save-rules", async (rules, activeSessionId) => {
    const settings = await store.setRules(rules);
    let session = null;
    if (activeSessionId) {
      session = await store.rescore(activeSessionId);
      git.schedulePush("shrike: rescore session against updated rules");
    }
    return { settings, session, sessions: await store.listSessions() };
  });

  handle("settings:reset-rules", async (activeSessionId) => {
    const settings = await store.setRules(defaultRules());
    let session = null;
    if (activeSessionId) {
      session = await store.rescore(activeSessionId);
      git.schedulePush("shrike: rescore session against default rules");
    }
    return { settings, session, sessions: await store.listSessions() };
  });

  handle("settings:set-autopush", async (enabled) => {
    const settings = await store.setAutoPush(Boolean(enabled));
    git.setAutoPush(settings.sync.autoPush);
    return { settings, git: git.getState() };
  });

  handle("sync:push", async () => {
    const state = await git.pushNow("shrike: manual push");
    return { git: state };
  });

  handle("sync:pull", async () => {
    const state = await git.pullNow();
    const sessions = await store.listSessions();
    broadcast("sessions:changed", sessions);
    return { git: state, sessions };
  });

  handle("sync:set-remote", async (url) => {
    const state = await git.setRemote(url);
    return { git: state };
  });

  handle("sessions:list", () => store.listSessions());

  handle("sessions:create", async (name) => {
    const session = await store.createSession(name);
    git.schedulePush("shrike: create session");
    return { session, sessions: await store.listSessions() };
  });

  handle("sessions:get", (id) => store.readSession(id));

  handle("sessions:rename", async (id, name) => {
    const session = await store.renameSession(id, name);
    git.schedulePush("shrike: rename session");
    return { session, sessions: await store.listSessions() };
  });

  handle("sessions:delete", async (id) => {
    await store.deleteSession(id);
    git.schedulePush("shrike: delete session");
    return { sessions: await store.listSessions() };
  });

  handle("sessions:ingest", async ({ id, raw, mode, sourceName } = {}) => {
    if (typeof raw !== "string") throw new Error("No endpoint list supplied");
    if (Buffer.byteLength(raw, "utf8") > MAX_RAW_BYTES) {
      throw new Error("Endpoint list is larger than the 20 MB limit");
    }
    if (mode !== "append" && mode !== "replace") throw new Error("Invalid import mode");
    const session = await store.ingest(id, raw, mode, sourceName || null);
    git.schedulePush(mode === "append" ? "shrike: append endpoints" : "shrike: import endpoints");
    return { session, sessions: await store.listSessions() };
  });

  handle("sessions:rescore", async (id) => {
    const session = await store.rescore(id);
    git.schedulePush("shrike: rescore session");
    return { session, sessions: await store.listSessions() };
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

    // Screenshot-only affordances so the detail pane and import dialog can be
    // captured without a UI automation dependency.
    const rowIndex = Number(process.env.SHRIKE_SELECT_ROW ?? "-1");
    if (Number.isInteger(rowIndex) && rowIndex >= 0) {
      await win.webContents
        .executeJavaScript(
          `document.querySelectorAll("table.endpoints tbody tr.row")[${rowIndex}]?.click()`,
        )
        .catch(() => {});
      await delay(300);
    }
    if (process.env.SHRIKE_OPEN_IMPORT) {
      await win.webContents
        .executeJavaScript(
          `[...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Import endpoints"))?.click()`,
        )
        .catch(() => {});
      await delay(400);
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

  registerIpc();
  await git.init();
  createWindow();
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
