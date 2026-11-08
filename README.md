# Shrike

Local-first bounty discovery for HackerOne. Load the public directory once, filter it
against criteria you set, save the programs worth your time, and push those choices to your
own Git remote so another machine or person can pull them.

Shrike never contacts the companies in the directory. It reads HackerOne's public listings,
then works entirely on the local copy.

## Run the app

Prebuilt Windows installer:

| File | Use |
| --- | --- |
| `Shrike-Setup-2.1.2.exe` | One-click per-user installer: Start Menu + desktop shortcut. |

The installed build is the only supported distribution. It updates itself from GitHub
Releases; the portable build was removed because a running portable exe cannot replace
itself. Data lives in `Documents\Shrike`, not next to the exe, so app updates never touch
your saved views or shortlist. The installer is unsigned, so SmartScreen may warn on first
run: **More info → Run anyway**.

From source:

```
npm install
npm run dev
```

## Requirements

- Node.js 20+ and npm (development)
- `git` on `PATH`
- A Git remote if you want to sync saved views and the shortlist (optional)

## What it does

- **Load HackerOne** — reads every public paying bounty and VDP, about 449 programs across
  18 pages. One request per page, cached locally.
- **Filter** by top payout, program type (bounty / VDP / external), minimum resolved reports,
  minimum response efficiency, launch year, include/exclude keywords and shortlist state.
- **Save views** — name a filter combination and reapply it with one click. Three starter
  views are created on first run: High payout, New this year and VDPs.
- **Shortlist** — star programs, set a status (Interested / Working on it / Submitted) and
  keep notes.
- **Export** the current view as CSV.
- **Sync** saved views and shortlist notes with Git from **Settings**.
- **Update** the installed app from public GitHub Releases, without touching saved data.

Filters apply instantly to the full cached list. There is no Apply button and no partial-page
filtering; “42 of 449” means the filter saw all 449.

## Using it

1. Open **Bounties** and click **Read HackerOne directory** on first run.
2. Set filters with the **Filters** button. Remove an active filter by clicking its chip.
3. Save a combination as a view when you want to come back to it.
4. Star interesting programs. Edit status and notes from the detail pane or the **Saved** tab.
5. Open **Settings** to configure Git sync, the cache age, default sort and default view.
6. Use **CSV** in the toolbar to export exactly what is on screen.

Keyboard: `/` focuses the bounty search.

## App updates

The installed build checks public GitHub Releases (`Grymm9/Shrike`) and can download and
install a newer version from **Settings → App updates**.

- **Check on launch** is on by default. It only notifies; nothing downloads until you click.
- **Check for updates** → **Download v…** → **Restart and install**.
- The NSIS installer replaces the app files only. Saved views, shortlist notes and the bounty
  cache in `Documents\Shrike` are never deleted or replaced.
- Only the installed build can self-update. There is no portable build.
- The repository and its releases must be public; the updater needs no token.
- First install of 2.1.2 is manual. Versions after that can update in place.

## Publishing a release

From a clean version bump:

```
npm version patch
npm run release        # needs GH_TOKEN with repo access
```

Or push a tag and let GitHub Actions build and publish:

```
git push
git tag v2.1.2
git push origin v2.1.2
```

`.github/workflows/release.yml` runs typecheck/tests, builds the installer, and publishes
`Shrike-Setup-<version>.exe`, its blockmap and `latest.yml` to GitHub Releases. The release
must be published, not a draft, before other installs can see it.

## Filter semantics

- **Payout** compares against the program's top payout. “At least $5,000” means the top
  payout is $5,000 or more.
- **Type** — leave all unchecked to include every type.
- **Reports** — minimum resolved reports.
- **Response** — minimum response-efficiency percentage; programs without the figure are
  excluded when a minimum is set.
- **Launched after** — four-digit year.
- **Keywords** — comma or space separated. Include terms must all match; exclude terms must
  none match. Matching covers name, handle, platform, type and tags.

## Local storage

| Mode | Workspace |
| --- | --- |
| Packaged app | `%USERPROFILE%\Documents\Shrike` (`~/Documents/Shrike` elsewhere) |
| `npm run dev` | `<project>\.shrike-workspace` |
| Override | `SHRIKE_WORKSPACE=/path/to/workspace` |

```
<workspace>/
  config/bounties.json     # cached HackerOne listings (gitignored)
  config/views.json        # saved filter views (synced)
  config/shortlist.json    # saved programs, statuses and notes (synced)
  config/settings.json     # Git auto-push, defaults (gitignored)
  config/git-state.json    # last successful sync timestamp (gitignored)
  config/backups/          # pre-update copies of views/shortlist (gitignored)
  sessions/                # old v1 engagement files (ignored, archive/delete in Settings)
  archive/engagements/     # archived v1 files (ignored)
```

Atomic writes go to a temp file, `fsync`, then rename. Corrupt files fall back to defaults
instead of breaking startup.

## Git sync

Git sync is for **data only**: saved views and shortlist notes. App binaries are delivered
through GitHub Releases, not through this remote.

1. Open **Settings → Git sync**.
2. Paste an `https://`, `ssh://` or `git@` remote and click **Save remote**.
3. Saved views and shortlist notes are committed as `Shrike <shrike@local>` and pushed to
   `origin main` after a short debounce, or immediately with **Push changes**.
4. **Fetch latest** pulls with rebase and reloads views and shortlist.

Only `config/views.json`, `config/shortlist.json` and `.gitignore` are committed. The bounty
cache, settings and credentials stay local. Auto-push can be turned off; manual push still
works.

## Upgrading from v1

v1 endpoint engagements are not deleted. They are listed in **Settings → Old engagement
files**, where each file can be archived to `archive/engagements/` or deleted. The endpoint
dashboard, scoring engine, import dialog and Rules section are gone.

If old session files were already committed to your Git remote, archiving or deleting them
locally does not remove them from that remote. Remove them with Git when you are ready.

## HackerOne limits

- HackerOne's public directory is the only source in v2. Other platforms can be added as
  adapters later.
- Scope and asset types are not in the directory payload. Shrike does not fetch every
  program page; use **Open on HackerOne** for the full scope.
- Listings behind a login, or pages HackerOne blocks, are unavailable.
- The reader makes one request per page, caches the result, and sends no cookies. Use it
  within HackerOne's terms.

## Development

```
npm run dev        # Vite dev server + Electron
npm test           # adapter, filter, store and real git tests
npm run typecheck  # strict TypeScript across renderer and tests
npm run build      # production renderer bundle
npm start          # run the production bundle in Electron
npm run dist       # build the installer + latest.yml (no publish)
npm run release    # build and publish to GitHub Releases (needs GH_TOKEN)
```

The adapters and filter engine live in `electron/lib` as pure ES modules. The main process
and renderer share the filter code, so CSV export cannot disagree with the table.

Demo data for UI work (never point this at your real workspace):

```
npm run seed:demo
SHRIKE_WORKSPACE=%TEMP%\opencode\shrike-demo npm run shot -- shots/bounties.png bounties
```

## Layout

```
electron/main.js              window, IPC, full-directory refresh, CSV export
electron/preload.cjs          typed window.shrike bridge (contextIsolation + sandbox)
electron/lib/bounties.js      HackerOne query, normalisation, cache and CSV shape
electron/lib/bountyFilters.js filtering, sorting, saved-view metadata
electron/lib/fetchPage.js     capped, redirect-checked HTTP reader
electron/lib/store.js         atomic JSON store, views, shortlist, legacy files
electron/lib/git.js           debounced auto-push, pull/rebase, error classification
electron/lib/updates.js       GitHub Releases updater for the installed build
src/components/BountiesView   board, filters, detail pane, progress
src/components/Saved…         shortlist with status and notes
src/components/SettingsPanel  updates, Git sync, preferences, archive/delete
tests/                        adapter, filter, store and git integration tests
```
