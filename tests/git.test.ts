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

afterEach(async () => {
  for (const dir of cleanups.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("GitSync", () => {
  it("initialises a repo and commits session files locally when there is no remote", async () => {
    const repo = await tempDir("shrike-sync-local-");
    const states: Array<{ phase: string; message: string }> = [];
    const sync = new GitSync({ repo, onStatus: (s: { phase: string; message: string }) => states.push(s), autoPush: false });

    const initial = await sync.init();
    expect(initial.hasRepo).toBe(true);
    expect(initial.remote).toBeNull();

    const ignore = await fs.readFile(path.join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain("node_modules/");
    expect(ignore).toContain("config/");

    await fs.mkdir(path.join(repo, "sessions"), { recursive: true });
    await fs.writeFile(path.join(repo, "sessions", "a.json"), '{"id":"a"}\n', "utf8");

    const state = await sync.pushNow("test: local commit");
    expect(state.phase).toBe("idle");
    expect(state.message).toMatch(/no remote configured/i);

    const log = git(repo, ["log", "--oneline"]);
    expect(log).toContain("test: local commit");
    expect(states.some((s) => s.phase === "working")).toBe(true);
  });

  it("pushes to a remote once one is configured", async () => {
    const remote = await tempDir("shrike-sync-remote-");
    git(remote, ["init", "--bare", "-b", "main"]);

    const repo = await tempDir("shrike-sync-push-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();

    await fs.mkdir(path.join(repo, "sessions"), { recursive: true });
    await fs.writeFile(path.join(repo, "sessions", "a.json"), '{"id":"a"}\n', "utf8");

    git(repo, ["remote", "add", "origin", remote]);
    await sync.init();

    const state = await sync.pushNow("test: push");
    expect(state.phase).toBe("idle");
    expect(state.message).toMatch(/pushed/i);

    const head = git(remote, ["rev-parse", "--verify", "refs/heads/main"]).trim();
    expect(head).toHaveLength(40);
  });

  it("pulls session files written by another clone", async () => {
    const remote = await tempDir("shrike-sync-remote2-");
    git(remote, ["init", "--bare", "-b", "main"]);

    const repo = await tempDir("shrike-sync-pull-");
    const sync = new GitSync({ repo, onStatus: () => {}, autoPush: false });
    await sync.init();
    await fs.mkdir(path.join(repo, "sessions"), { recursive: true });
    await fs.writeFile(path.join(repo, "sessions", "a.json"), '{"id":"a"}\n', "utf8");
    git(repo, ["remote", "add", "origin", remote]);
    await sync.init();
    await sync.pushNow("test: seed");

    const cloneParent = await tempDir("shrike-sync-clone-");
    const clone = path.join(cloneParent, "clone");
    git(cloneParent, ["clone", remote, clone]);
    await fs.mkdir(path.join(clone, "sessions"), { recursive: true });
    await fs.writeFile(path.join(clone, "sessions", "b.json"), '{"id":"b"}\n', "utf8");
    git(clone, ["add", "-A"]);
    git(clone, ["-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-m", "remote change"]);
    git(clone, ["push", "origin", "main"]);

    const state = await sync.pullNow();
    expect(state.phase).toBe("idle");

    const pulled = await fs.readFile(path.join(repo, "sessions", "b.json"), "utf8");
    expect(pulled).toContain('"id":"b"');
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

    await fs.mkdir(path.join(repo, "sessions"), { recursive: true });
    await fs.writeFile(path.join(repo, "sessions", "c.json"), '{"id":"c"}\n', "utf8");

    sync.schedulePush("test: debounced");
    const state = await sync.flush();
    expect(state.phase).toBe("idle");

    const log = git(repo, ["log", "--oneline"]);
    expect(log).toContain("test: debounced");
  });
});
