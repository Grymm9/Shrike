/**
 * GitHub Releases updater for the installed (NSIS) build.
 *
 * We talk to the GitHub REST API rather than the browser download route.
 * GitHub sometimes returns 404 on
 * `github.com/<owner>/<repo>/releases/download/...` for several minutes after
 * publishing while the API asset endpoint is already usable. Using the API
 * asset URL with `Accept: application/octet-stream` avoids that race.
 *
 * The downloaded installer is verified against the SHA-512 in latest.yml, then
 * launched. Saved data lives in Documents\Shrike, outside the install directory,
 * and is backed up before install by the main process.
 */

import { app } from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { load as loadYaml } from "js-yaml";
import semver from "semver";

const OWNER = "Grymm9";
const REPO = "Shrike";
const API_ROOT =
  process.env.SHRIKE_UPDATE_API_ROOT || `https://api.github.com/repos/${OWNER}/${REPO}`;
const RELEASE_URL = `${API_ROOT}/releases/latest`;
const USER_AGENT = `Shrike/${app.getVersion()} (update check)`;
const MAX_NOTES = 8000;
const API_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

function cleanNotes(notes) {
  if (!notes) return null;
  if (typeof notes === "string") return notes.slice(0, MAX_NOTES);
  return null;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/no published github release|404|not found/.test(lower)) {
    return "No published GitHub release was found yet. Publish a release with latest.yml first.";
  }
  if (/rate limit|403|forbidden|401|unauthorized/.test(lower)) {
    return "GitHub refused or throttled the update request. Try again later.";
  }
  if (/missing latest\.yml|missing its installer|manifest/.test(lower)) {
    return "The latest release is missing latest.yml or its installer.";
  }
  if (/checksum|verification|sha-?512/.test(lower)) {
    return "The downloaded update failed verification and was not installed.";
  }
  if (/enotfound|econnrefused|network|getaddrinfo|timeout|socket|fetch failed|aborted/.test(lower)) {
    return "Couldn't reach GitHub. Check your connection and try again.";
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

function assetUrl(asset) {
  return asset?.url;
}

async function fetchRelease() {
  const response = await fetch(RELEASE_URL, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/vnd.github+json",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new Error("No published GitHub release was found yet.");
  }
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") throw new Error("GitHub API rate limit reached.");
    throw new Error("GitHub refused the update request.");
  }
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  const release = await response.json();
  if (!release || release.draft || release.prerelease) {
    throw new Error("No published GitHub release was found yet.");
  }
  return release;
}

async function fetchAsset(asset, timeoutMs = API_TIMEOUT_MS) {
  if (!asset?.url) throw new Error("The release asset is missing its API URL.");
  const response = await fetch(asset.url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/octet-stream",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status} for ${asset.name}.`);
  }
  return response;
}

function parseManifest(text) {
  let data;
  try {
    data = loadYaml(text);
  } catch {
    throw new Error("The release manifest could not be parsed.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("The release manifest is empty.");
  }

  const version = String(data.version ?? "");
  if (!semver.valid(version)) {
    throw new Error("The release manifest has an invalid version.");
  }

  const file = Array.isArray(data.files) ? data.files[0] : null;
  const rawPath = String(data.path ?? file?.url ?? "");
  const fileName = path.basename(decodeURIComponent(rawPath));
  const sha512 = String(data.sha512 ?? file?.sha512 ?? "");

  if (!fileName) throw new Error("The release manifest has no installer filename.");
  if (!sha512) throw new Error("The release manifest has no SHA-512 checksum.");

  return {
    version,
    fileName,
    sha512,
    size: Number(data.size ?? file?.size) || 0,
  };
}

export class AppUpdater {
  constructor({ onStatus, autoCheck = true } = {}) {
    this.onStatus = onStatus;
    this.autoCheck = autoCheck;
    this.state = baseState();
    this.pending = null;
    this.installerPath = null;
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
    // The custom API updater needs no event wiring.
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

    if (this.state.status === "downloading") return this.getState();

    this.emit({ status: "checking", message: "Checking GitHub for a new version…" });

    try {
      const release = await fetchRelease();
      const manifestAsset = release.assets?.find((asset) => asset.name === "latest.yml");
      if (!manifestAsset) throw new Error("The latest release is missing latest.yml.");

      const manifestResponse = await fetchAsset(manifestAsset);
      const manifest = parseManifest(await manifestResponse.text());

      let installer =
        release.assets?.find((asset) => asset.name === manifest.fileName) ?? null;
      if (!installer) {
        installer =
          release.assets?.find(
            (asset) =>
              typeof asset.name === "string" &&
              /\.exe$/i.test(asset.name) &&
              asset.name.startsWith("Shrike-Setup"),
          ) ?? null;
      }
      if (!installer) throw new Error("The latest release is missing its installer.");

      if (!semver.gt(manifest.version, app.getVersion())) {
        this.pending = null;
        this.installerPath = null;
        this.emit({
          status: "current",
          version: null,
          notes: null,
          percent: 0,
          message: `You are up to date (${app.getVersion()}).`,
        });
        return this.getState();
      }

      this.pending = {
        version: manifest.version,
        assetUrl: assetUrl(installer),
        fileName: installer.name || manifest.fileName,
        sha512: manifest.sha512,
        size: installer.size || manifest.size,
        notes: cleanNotes(release.body),
      };
      this.installerPath = null;

      this.emit({
        status: "available",
        version: manifest.version,
        notes: this.pending.notes,
        percent: 0,
        message: `Version ${manifest.version} is available.`,
      });
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
    if (!this.pending?.assetUrl) {
      this.emit({
        status: "error",
        message: "Check for updates before downloading an installer.",
      });
      return this.getState();
    }

    const dir = path.join(app.getPath("temp"), "shrike-updates");
    const target = path.join(dir, this.pending.fileName);

    this.emit({ status: "downloading", percent: 0, message: "Starting download…" });

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.rm(target, { force: true });

      const response = await fetchAsset({ url: this.pending.assetUrl }, DOWNLOAD_TIMEOUT_MS);
      if (!response.body) throw new Error("GitHub returned an empty installer.");

      const total =
        Number(response.headers.get("content-length")) || this.pending.size || 0;
      const hash = crypto.createHash("sha512");
      let received = 0;
      let lastPercent = -1;

      const transform = new Transform({
        transform: (chunk, _encoding, callback) => {
          hash.update(chunk);
          received += chunk.length;
          if (total) {
            const percent = Math.min(100, (received / total) * 100);
            if (percent - lastPercent >= 1 || percent === 100) {
              lastPercent = percent;
              this.emit({
                status: "downloading",
                percent,
                message: `Downloading update… ${Math.round(percent)}%`,
              });
            }
          }
          callback(null, chunk);
        },
      });

      await pipeline(
        Readable.fromWeb(response.body),
        transform,
        createWriteStream(target),
      );

      const digest = hash.digest("base64");
      if (digest !== this.pending.sha512) {
        await fs.rm(target, { force: true });
        throw new Error("The downloaded update failed verification.");
      }

      this.installerPath = target;
      this.emit({
        status: "downloaded",
        version: this.pending.version,
        percent: 100,
        message: "Update downloaded. Restart Shrike to install it.",
      });
    } catch (error) {
      await fs.rm(target, { force: true }).catch(() => {});
      this.emit({ status: "error", message: friendlyError(error) });
    }

    return this.getState();
  }

  install() {
    if (this.state.status !== "downloaded" || !this.installerPath) {
      throw new Error("The update has not finished downloading yet.");
    }

    let child;
    try {
      child = spawn(this.installerPath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.unref();
    } catch (error) {
      this.emit({
        status: "error",
        message: error instanceof Error ? error.message : "Could not start the installer.",
      });
      return false;
    }

    // Let the IPC acknowledgement go back before the app closes.
    setImmediate(() => app.quit());
    return true;
  }
}
