/**
 * GitHub Releases updater for the installed (NSIS) build.
 *
 * The portable build was removed on purpose: a running portable exe cannot
 * replace itself. Only the installed app checks for updates.
 *
 * electron-builder writes app-update.yml into the packaged resources and
 * latest.yml next to the installer. electron-updater uses those to find the
 * newest release on the public GitHub repo configured in package.json.
 */

import { app } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const MAX_NOTES = 8000;

function cleanNotes(notes) {
  if (!notes) return null;
  if (typeof notes === "string") return notes.slice(0, MAX_NOTES);
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return String(item.note ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_NOTES);
  }
  return null;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/app-update\.yml|dev-app-update/.test(lower)) {
    return "This build has no update metadata. Install the latest setup once, then updates will work.";
  }
  if (/no published versions|no published release|no releases|404|not found/.test(lower)) {
    return "No published GitHub release was found yet. Publish a release with latest.yml first.";
  }
  if (/401|403|authentication|forbidden/.test(lower)) {
    return "GitHub refused the update request. Make sure the repository is public.";
  }
  if (/enotfound|econnrefused|network|getaddrinfo|timeout|socket/.test(lower)) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  if (/sha512|checksum|signature|code signature/.test(lower)) {
    return "The downloaded update failed verification and was not installed.";
  }
  return message || "The update check failed.";
}

function baseState() {
  return {
    status: app.isPackaged ? "idle" : "unavailable",
    currentVersion: app.getVersion(),
    version: null,
    notes: null,
    percent: 0,
    message: app.isPackaged
      ? "Not checked yet."
      : "App updates are available in the installed build only.",
    packaged: app.isPackaged,
  };
}

export class AppUpdater {
  constructor({ onStatus, autoCheck = true } = {}) {
    this.onStatus = onStatus;
    this.autoCheck = autoCheck;
    this.state = baseState();
    this.initialized = false;
    this.timer = null;
  }

  getState() {
    return { ...this.state };
  }

  emit(patch) {
    this.state = { ...this.state, ...patch };
    try {
      this.onStatus?.(this.getState());
    } catch {
      // A renderer that has gone away must not break the updater.
    }
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on("checking-for-update", () => {
      this.emit({
        status: "checking",
        message: "Checking GitHub for a new version…",
      });
    });

    autoUpdater.on("update-available", (info) => {
      this.emit({
        status: "available",
        version: info?.version ?? null,
        notes: cleanNotes(info?.releaseNotes),
        percent: 0,
        message: info?.version
          ? `Version ${info.version} is available.`
          : "A new version is available.",
      });
    });

    autoUpdater.on("update-not-available", () => {
      this.emit({
        status: "current",
        version: null,
        notes: null,
        percent: 0,
        message: `You are up to date (${this.state.currentVersion}).`,
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
      this.emit({
        status: "downloading",
        percent,
        message: `Downloading update… ${Math.round(percent)}%`,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.emit({
        status: "downloaded",
        version: info?.version ?? this.state.version,
        percent: 100,
        message: "Update downloaded. Restart Shrike to install it.",
      });
    });

    autoUpdater.on("error", (error) => {
      this.emit({
        status: "error",
        message: friendlyError(error),
      });
    });
  }

  setAutoCheck(enabled) {
    this.autoCheck = Boolean(enabled);
    if (!this.autoCheck && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleAutoCheck(delayMs = 4000) {
    if (!app.isPackaged || !this.autoCheck || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check().catch(() => {});
    }, delayMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  async check() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!app.isPackaged) {
      this.emit({
        status: "unavailable",
        message: "App updates are available in the installed build only.",
      });
      return this.getState();
    }

    if (this.state.status === "downloading") {
      return this.getState();
    }

    this.emit({ status: "checking", message: "Checking GitHub for a new version…" });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.emit({ status: "error", message: friendlyError(error) });
    }
    return this.getState();
  }

  async download() {
    if (!app.isPackaged) {
      this.emit({
        status: "unavailable",
        message: "App updates are available in the installed build only.",
      });
      return this.getState();
    }

    if (this.state.status === "downloading") return this.getState();

    this.emit({
      status: "downloading",
      percent: 0,
      message: "Starting download…",
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.emit({ status: "error", message: friendlyError(error) });
    }
    return this.getState();
  }

  install() {
    if (this.state.status !== "downloaded") {
      throw new Error("The update has not finished downloading yet.");
    }
    // Let the IPC acknowledgement go back before the app closes.
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch {
        // The installer is already running or the app is shutting down.
      }
    });
    return true;
  }
}
