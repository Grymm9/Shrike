import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GitSync } from "../electron/lib/git.js";

const cleanups: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function writeSyncedFiles(repo: string, viewName = "High payout") {
  await fs.mkdir(path.join(repo, "config"), { recursive: true });
  await fs.writeFile(
    path.join(repo, "config", "views.json"),
    JSON.stringify({ schemaVersion: 1, views: [{ id: "high", name: viewName }] }) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(repo, "config", "shortlist.json"),
    JSON.stringify({ schemaVersion: 1, items: {} }) + "\n",
    "utf8",
  );
}

afterEach(async () => {
  for (const dir of cleanups.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("GitSync", () => {
  it("initialises a repo, ignores local data and commits synced files", async () => {
    const repo = await tempDir("shrike-sync-local-");
    const states: Array<{ phase: string; message: string }> = [];
    const sync = new GitSync({
      repo,
      onStatus: (state: { phase: string; message: string }) => states.push(state),
      autoPush: false,
    });

    const initial = await sync.init();
    expect(initial.hasRepo).toBe(true);
    expect(initial.remote).toBeNull();

    const ignore = await fs.readFile(path.join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain("node_modules/");
    expect(ignore).toContain("sessions/");
    expect(ignore).toContain("config/settings.json");
    expect(ignore).toContain("config/bounties.json");
    expect(ignore.split(/\r?\n/)).not.toContain("config/");

    await writeSyncedFiles(repo);
    const state = await sync.pushNow("test: local commit");
    expect(state.phase).toBe("idle");
    expect(state.message).toMatch(/no remote configured/i);

    const log = git(repo, ["log", "--oneline"]);
    expect(log).toContain("test: local commit");
    expect(states.some((item) => item.phase === "working")).toBe(true);
  });

  it("removes the old blanket config ignore rule", async () => {
    const repo = await tempDir("shrike-sync-ignore-");
    await fs.writeFile(path.join(repo, ".gitignore"), "config/\nsessions/*.tmp-*\n", "utf8");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();

    const ignore = await fs.readFile(path.join(repo, ".gitignore"), "utf8");
    expect(ignore.split(/\r?\n/)).not.toContain("config/");
    expect(ignore).toContain("config/settings.json");
    expect(ignore.split(/\r?\n/)).not.toContain("config/views.json");
  });

  it("pushes to a remote once one is configured", async () => {
    const remote = await tempDir("shrike-sync-remote-");
    git(remote, ["init", "--bare", "-b", "main"]);

    const repo = await tempDir("shrike-sync-push-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();
    await writeSyncedFiles(repo);

    git(repo, ["remote", "add", "origin", remote]);
    await sync.init();

    const state = await sync.pushNow("test: push");
    expect(state.phase).toBe("idle");
    expect(state.message).toMatch(/pushed/i);

    const head = git(remote, ["rev-parse", "--verify", "refs/heads/main"]).trim();
    expect(head).toHaveLength(40);
  });

  it("pulls saved views written by another clone", async () => {
    const remote = await tempDir("shrike-sync-remote2-");
    git(remote, ["init", "--bare", "-b", "main"]);

    const repo = await tempDir("shrike-sync-pull-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();
    await writeSyncedFiles(repo);
    git(repo, ["remote", "add", "origin", remote]);
    await sync.init();
    await sync.pushNow("test: seed");

    const cloneParent = await tempDir("shrike-sync-clone-");
    const clone = path.join(cloneParent, "clone");
    git(cloneParent, ["clone", remote, clone]);
    await fs.writeFile(
      path.join(clone, "config", "views.json"),
      JSON.stringify({ schemaVersion: 1, views: [{ id: "remote", name: "Remote view" }] }) + "\n",
      "utf8",
    );
    git(clone, ["add", "-A"]);
    git(clone, ["-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-m", "remote change"]);
    git(clone, ["push", "origin", "main"]);

    const state = await sync.pullNow();
    expect(state.phase).toBe("idle");

    const pulled = await fs.readFile(path.join(repo, "config", "views.json"), "utf8");
    expect(pulled).toContain("Remote view");
  });

  it("refuses to pull without a remote", async () => {
    const repo = await tempDir("shrike-sync-noremote-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();
    await expect(sync.pullNow()).rejects.toThrow(/no remote/i);
  });

  it("rejects an invalid remote URL", async () => {
    const repo = await tempDir("shrike-sync-badremote-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();
    await expect(sync.setRemote("not-a-url")).rejects.toThrow(/https|ssh|git@/i);
  });

  it("flushes a debounced push instead of waiting for the timer", async () => {
    const repo = await tempDir("shrike-sync-debounce-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: true });
    await sync.init();
    await writeSyncedFiles(repo);

    sync.schedulePush("test: debounced");
    const state = await sync.flush();
    expect(state.phase).toBe("idle");

    const log = git(repo, ["log", "--oneline"]);
    expect(log).toContain("test: debounced");
  });
});
