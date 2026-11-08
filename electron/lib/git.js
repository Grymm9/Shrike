import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args, { cwd, timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      stderr += "\nTimed out";
      finish(-1);
    }, timeout);

    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      stderr += "\n" + err.message;
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });
}

const GITIGNORE_LINES = [
  "node_modules/",
  "dist/",
  "release/",
  "sessions/",
  "archive/",
  "config/settings.json",
  "config/git-state.json",
  "config/bounties.json",
  "config/backups/",
  "*.log",
  ".DS_Store",
  "Thumbs.db",
];
const TRACKED_FILES = [".gitignore", "config/views.json", "config/shortlist.json"];

function classify(stderr) {
  const text = stderr.toLowerCase();
  if (/rejected|non-fast-forward|fetch first|behind its remote/.test(text)) {
    return { phase: "behind", message: "The remote has commits you don't have yet. Use Fetch latest in Settings." };
  }
  if (/couldn't find remote ref|no such ref|remote branch .* not found/.test(text)) {
    return { phase: "error", message: "The remote has no main branch yet. Push changes once to create it." };
  }
  if (/authentication failed|could not read username|permission denied|403|terminal prompts disabled/.test(text)) {
    return { phase: "error", message: "Git couldn't sign in to the remote. Add a GitHub token or SSH key on this machine." };
  }
  if (/could not resolve host|unable to access|connection|network|timed out|does not appear to be a git repository/.test(text)) {
    return { phase: "offline", message: "Can't reach the remote. Your work is saved locally." };
  }
  return { phase: "error", message: stderr.split("\n").filter(Boolean).slice(-1)[0] || "Git failed. Check the remote URL and try again." };
}

export class GitSync {
  constructor({ repo, onStatus, autoPush = true, lastSyncAt = null }) {
    this.repo = repo;
    this.onStatus = onStatus;
    this.autoPush = autoPush;
    this.queue = Promise.resolve();
    this.timer = null;
    this.pendingMessage = null;
    this.state = {
      phase: "idle",
      action: null,
      message: "Local repository ready",
      lastSyncAt,
      remote: null,
      branch: "main",
      autoPush,
      repo,
      hasRepo: false,
    };
  }

  getState() {
    return { ...this.state };
  }

  emit(patch) {
    this.state = { ...this.state, ...patch };
    try {
      this.onStatus?.(this.getState());
    } catch {
      // A renderer that has gone away must not break sync.
    }
  }

  git(args, opts) {
    return run("git", ["-C", this.repo, ...args], { cwd: this.repo, ...opts });
  }

  enqueue(fn) {
    const runNext = this.queue.then(fn, fn);
    this.queue = runNext.catch(() => {});
    return runNext;
  }

  async ensureGitignore() {
    const file = path.join(this.repo, ".gitignore");
    let existing = "";
    try {
      existing = await fs.readFile(file, "utf8");
    } catch {
      existing = "";
    }
    // v1 ignored all of config/; that would hide the files we now sync.
    const stale = new Set(["config/", "sessions/*.tmp-*"]);
    const lines = existing
      .split(/\r?\n/)
      .filter((line) => !stale.has(line.trim()));
    const present = new Set(lines.map((line) => line.trim()));
    const missing = GITIGNORE_LINES.filter((line) => !present.has(line));
    if (missing.length) {
      lines.push(...missing);
    }
    const next = lines.join("\n").replace(/^\n+/, "").replace(/\s*$/, "") + "\n";
    if (next !== existing) {
      await fs.writeFile(file, next, "utf8");
    }
  }

  async detectBranch() {
    const res = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (res.code === 0 && res.stdout && res.stdout !== "HEAD") return res.stdout;
    return "main";
  }

  async detectRemote() {
    const res = await this.git(["remote", "get-url", "origin"]);
    return res.code === 0 && res.stdout ? res.stdout : null;
  }

  async init() {
    await fs.mkdir(this.repo, { recursive: true });

    let hasRepo = true;
    try {
      await fs.access(path.join(this.repo, ".git"));
    } catch {
      hasRepo = false;
    }

    if (!hasRepo) {
      const res = await this.git(["init", "-b", "main"]);
      if (res.code !== 0) {
        this.emit({
          phase: "error",
          message: "Couldn't create the local Git repository. " + res.stderr,
        });
        return this.getState();
      }
      this.emit({ message: "Local Git repository created" });
    }

    await this.ensureGitignore();

    const branch = await this.detectBranch();
    const remote = await this.detectRemote();

    this.emit({
      branch,
      remote,
      hasRepo: true,
      phase: "idle",
      message: remote ? `Connected to origin/${branch}` : "Saved locally · no remote configured",
    });
    return this.getState();
  }

  async hasCommits() {
    const res = await this.git(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return res.code === 0;
  }

  async aheadCount() {
    const res = await this.git(["rev-list", "--count", `origin/${this.state.branch}..HEAD`]);
    if (res.code !== 0) return 1;
    const n = Number(res.stdout);
    return Number.isFinite(n) ? n : 1;
  }

  setAutoPush(enabled) {
    this.autoPush = Boolean(enabled);
    if (!this.autoPush && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pendingMessage = null;
    }
    this.emit({ autoPush: this.autoPush });
  }

  schedulePush(message) {
    if (!this.autoPush) return;
    if (this.timer) clearTimeout(this.timer);
    this.pendingMessage = message || "shrike: saved bounties update";
    this.emit({ phase: "idle", action: null, message: "Changes queued · pushing in a moment" });
    this.timer = setTimeout(() => {
      this.timer = null;
      const msg = this.pendingMessage || "shrike: saved bounties update";
      this.pendingMessage = null;
      this.pushNow(msg).catch(() => {});
    }, 1200);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  async flush() {
    if (!this.autoPush) return this.getState();
    if (!this.timer) return this.getState();
    clearTimeout(this.timer);
    this.timer = null;
    const msg = this.pendingMessage || "shrike: saved bounties update";
    this.pendingMessage = null;
    return this.pushNow(msg);
  }

  pushNow(message = "shrike: manual push") {
    return this.enqueue(async () => {
      this.emit({ phase: "working", action: "push", message: "Saving changes locally…" });
      try {
        const existing = [];
        for (const file of TRACKED_FILES) {
          try {
            await fs.access(path.join(this.repo, file));
            existing.push(file);
          } catch {
            // A missing file simply has nothing to stage.
          }
        }

        if (existing.length) {
          const add = await this.git(["add", "--", ...existing]);
          if (add.code !== 0) {
            throw new Error(add.stderr || "git add failed");
          }
        }

        const diff = await this.git(["diff", "--cached", "--quiet"]);
        const hasChanges = diff.code === 1;
        if (diff.code !== 0 && diff.code !== 1) {
          throw new Error(diff.stderr || "git diff failed");
        }

        let committed = false;
        if (hasChanges) {
          const commit = await this.git([
            "-c",
            "user.name=Shrike",
            "-c",
            "user.email=shrike@local",
            "commit",
            "-m",
            message,
          ]);
          if (commit.code !== 0) {
            throw new Error(commit.stderr || "git commit failed");
          }
          committed = true;
        }

        if (!this.state.remote) {
          this.emit({
            phase: "idle",
            action: null,
            message: committed
              ? "Saved locally · no remote configured"
              : "Nothing to save · no remote configured",
          });
          return this.getState();
        }

        const ahead = await this.aheadCount();
        if (!committed && ahead === 0) {
          this.emit({ phase: "idle", action: null, message: "Everything is up to date" });
          return this.getState();
        }

        this.emit({
          phase: "working",
          action: "push",
          message: `Pushing to origin/${this.state.branch}…`,
        });
        const push = await this.git(["push", "-u", "origin", this.state.branch], { timeout: 45000 });
        if (push.code !== 0) {
          const classified = classify(push.stderr);
          this.emit({ ...classified, action: null });
          throw new Error(classified.message);
        }

        const head = await this.git(["rev-parse", "--short", "HEAD"]);
        const short = head.code === 0 ? head.stdout : "";
        const lastSyncAt = new Date().toISOString();
        this.emit({
          phase: "idle",
          action: null,
          message: `Pushed ${short} to origin/${this.state.branch}`.trim(),
          lastSyncAt,
        });
        return this.getState();
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        // Keep an already-classified phase (offline/behind) instead of flattening to error.
        if (this.state.phase === "working") {
          this.emit({ phase: "error", action: null, message: messageText });
        }
        throw err;
      }
    });
  }

  pullNow() {
    return this.enqueue(async () => {
      if (!this.state.remote) {
        throw new Error("No remote configured. Add your Git remote in Settings first.");
      }
      this.emit({ phase: "working", action: "pull", message: `Pulling origin/${this.state.branch}…` });
      try {
        const pull = await this.git(["pull", "--rebase", "--autostash", "origin", this.state.branch], {
          timeout: 45000,
        });
        if (pull.code !== 0) {
          await this.git(["rebase", "--abort"]).catch(() => {});
          const classified = classify(pull.stderr);
          this.emit({ ...classified, action: null });
          throw new Error(classified.message);
        }
        const lastSyncAt = new Date().toISOString();
        const upToDate = /already up to date/i.test(pull.stdout);
        this.emit({
          phase: "idle",
          action: null,
          message: upToDate
            ? "Already up to date"
            : `Fetched the latest saved bounties from origin/${this.state.branch}`,
          lastSyncAt,
        });
        return this.getState();
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        if (this.state.phase === "working") {
          this.emit({ phase: "error", action: null, message: messageText });
        }
        throw err;
      }
    });
  }

  setRemote(url) {
    return this.enqueue(async () => {
      const value = String(url ?? "").trim();
      if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(value)) {
        throw new Error("Enter an https://, ssh:// or git@ clone URL for the remote.");
      }
      const existing = await this.git(["remote", "get-url", "origin"]);
      const res =
        existing.code === 0
          ? await this.git(["remote", "set-url", "origin", value])
          : await this.git(["remote", "add", "origin", value]);
      if (res.code !== 0) {
        throw new Error(res.stderr || "Couldn't save that remote URL.");
      }
      this.emit({ remote: value, phase: "idle", message: "Remote saved — pushes will go here" });
      return this.getState();
    });
  }
}

export { delay };
