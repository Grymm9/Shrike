# Shrike

Local-first endpoint triage for bug bounty recon. Paste a raw recon list, filter it with
rules you control, score what remains, and work down a ranked dashboard. Sessions are plain
JSON, committed and pushed to your own GitHub repo in the background.

Everything runs on your machine. **Shrike v1 never sends traffic to a target** — it only
parses, filters and ranks lists you already have.

## Run the app

Prebuilt Windows binaries are in `release/`:

| File | Use |
| --- | --- |
| `Shrike-1.0.0-Portable.exe` | Double-click to run. No install; extracts to a temp dir on launch. |
| `Shrike-Setup-1.0.0.exe` | Installer: choose a directory, Start Menu + desktop shortcut. |

Data (sessions, settings) always lives in `Documents\Shrike`, not next to the exe, so both
builds share the same workspace.

The binaries are unsigned, so Windows SmartScreen may show "Windows protected your PC":
**More info → Run anyway**. Some antivirus products also flag unsigned NSIS/portable
bundles; that is expected until the build is code-signed.

From source:

```
npm install
npm run dev
```

## Requirements

- Node.js 20+ and npm (development)
- `git` on `PATH`
- A GitHub repo if you want background sync (optional — everything works offline)

## What v1 does

- **Ingest** full URLs, `host/path`, path-only lines and optional `GET`/`POST`/… prefixes.
  Duplicates and unparseable lines are counted, not silently dropped.
- **Filter** by ignored file extensions (`.css`, `.png`, …) and ignored path segments
  (`/static`, `/health`, …). Segment rules match whole segments, so `/health` does not
  swallow `/healthcare`.
- **Score** with configurable weights: numeric IDs, UUIDs, sensitive object parameters,
  query parameters, path depth, plus keyword weights you define.
- **Rank** live in the dashboard with search, a score floor, ranked/filtered/all views and
  a per-endpoint score breakdown.
- **Edit rules** in the GUI. Changing rules re-scores the active session immediately;
  sessions scored under older rules are flagged `stale`.
- **Sync** sessions to GitHub automatically, with a manual **Sync / Fetch Latest** button.

v1 does not make HTTP requests, run scanners, or call external APIs. It is a triage surface
for lists produced by your own recon.

## Using it

1. Create a session (name it after the program).
2. **Import endpoints** — paste, drop a `.txt`/`.csv`, or load a file. Replace or append.
3. Work the **Ranked** tab. `↑`/`↓` move the selection, `Esc` closes the detail pane.
4. Tune **Rules & sync** when the ranking does not match your instinct. `Save & re-score`
   applies the new rules to the active session without re-importing.
5. **Sync / Fetch Latest** pulls `origin/main` and reloads sessions from disk.

## Local storage

| Mode | Workspace |
| --- | --- |
| Packaged app | `%USERPROFILE%\Documents\Shrike` (`~/Documents/Shrike` elsewhere) |
| `npm run dev` | `<project>\.shrike-workspace` |
| Override | `SHRIKE_WORKSPACE=/path/to/workspace` |

```
<workspace>/
  sessions/<uuid>.json     # one file per session: endpoints, rules snapshot, stats
  config/settings.json     # rules and sync preferences (gitignored)
  config/git-state.json    # last successful sync timestamp (gitignored)
```

Session writes go to a temp file, `fsync`, then atomic rename, so a crash cannot leave a
half-written session. Corrupt session files are skipped instead of breaking the list.
Each session records a `rulesHash` so you can tell whether its scores match current rules.

## GitHub sync

1. Create an empty repository (private is fine).
2. Open **Rules & sync**, paste the remote (`git@github.com:you/shrike-sessions.git` or an
   `https://` URL), and click **Save remote**.
3. Import or edit anything — Shrike stages `sessions/` and `.gitignore`, commits as
   `Shrike <shrike@local>`, and pushes to `origin main` after a short debounce.
4. **Sync / Fetch Latest** runs `git pull --rebase --autostash origin main` and refreshes
   the dashboard.

Only `sessions/` and `.gitignore` are committed; settings and credentials stay local.
Push and pull are serialised. Offline, missing-remote, auth and non-fast-forward failures
are surfaced in the sidebar/topbar without losing local work. Git runs with terminal
prompts disabled, so configure a credential helper or SSH key for HTTPS/SSH remotes.

If the remote has diverged, the pull is rebased; on conflict the rebase is aborted and the
error is reported. Resolve it in a terminal, then sync again.

## Scoring

Score is a weighted sum, not a percentage. Defaults:

| Signal | Weight | Cap |
| --- | --- | --- |
| Base | 5 | per endpoint |
| Numeric path segment (`/orders/1042`) | 12 | ×2 segments |
| UUID path segment | 10 | ×2 segments |
| Sensitive param (`order_id`, `user_id`, …) | 8 | once |
| Query parameters | 2 | ×3 params |
| Depth | 3 | ×3 segments past three |
| Keyword (`admin`, `billing`, …) | per keyword | once per keyword |

Keywords match whole tokens or token prefixes (4+ characters), so `user` matches `users`
but not `username`-unrelated tokens. Every contribution appears in the detail pane with its
delta, so a score is always explainable.

## Development

```
npm run dev        # Vite dev server + Electron
npm test           # engine tests + real git init/commit/push/pull tests
npm run typecheck  # strict TypeScript across renderer and tests
npm run build      # production renderer bundle
npm start          # run the production bundle in Electron
npm run dist       # icon + Windows installer and portable exe in release/
```

The engine lives in `electron/lib` as pure ES modules. The Electron main process and the
React renderer import the *same* modules, so rule previews in Settings and the import
dialog cannot drift from authoritative scoring.

Demo data for UI work (never point this at your real workspace):

```
npm run seed:demo
SHRIKE_WORKSPACE=%TEMP%\opencode\shrike-demo npm run shot -- shots/dashboard.png dashboard
```

`SHRIKE_SELECT_ROW=0` and `SHRIKE_OPEN_IMPORT=1` are screenshot-only hooks for the detail
pane and import dialog.

## Layout

```
electron/main.js        window, IPC, workspace resolution, screenshot harness
electron/preload.cjs    typed window.shrike bridge (contextIsolation + sandbox)
electron/lib/rules.js   rule defaults, normalisation, stable rules hash
electron/lib/ingest.js  parsing, filtering, scoring, ranking
electron/lib/store.js   atomic JSON store, settings, session lifecycle
electron/lib/git.js     debounced auto-push, pull/rebase, error classification
src/                    React UI (dashboard, rules, sessions, import dialog)
tests/                  engine and git integration tests
```

## v1 limits

- One user, one workspace, no server component.
- No live requests, no scanner integration, no HackerOne API calls — lists are imported.
- No conflict-resolution UI (rebases are aborted on conflict).
- Settings are per machine and intentionally not synced.
