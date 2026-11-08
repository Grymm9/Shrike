# Shrike

Local-first bounty discovery. Load public programs from HackerOne, Bugcrowd or YesWeHack,
filter them with criteria you set, and keep a shortlist with notes. Everything is stored on
your machine.

Shrike never contacts the companies in the directory. It reads public listings and then works
entirely on the local copy.

## Run the app

Prebuilt Windows installer:

| File | Use |
| --- | --- |
| `Shrike-Setup-2.2.0.exe` | One-click per-user installer: Start Menu + desktop shortcut. |

The installed build is the only supported distribution. It updates itself from GitHub
Releases; the portable build was removed because a running portable exe cannot replace
itself. Data lives in `Documents\Shrike`, so app updates never touch saved views or
shortlist notes. The installer is unsigned, so SmartScreen may warn on first run:
**More info → Run anyway**.

From source:

```
npm install
npm run dev
```

## Requirements

- Node.js 20+ and npm (development)
- An internet connection for reading public directories and checking releases

## What it does

- **Multiple sources** — HackerOne, Bugcrowd and YesWeHack. Pick one from the Source
  dropdown; each source keeps its own cache.
- **Filter** by top payout, program type (bounty / VDP / external), minimum resolved reports,
  minimum response efficiency, launch year, include/exclude keywords and shortlist state.
- **Save views** — name a filter combination and reapply it with one click.
- **Shortlist** — star programs, set a status (Interested / Working on it / Submitted) and
  keep notes.
- **Export** the current view as CSV.
- **Update** the installed app from public GitHub Releases, without touching saved data.

Filters apply instantly to the full cached list. There is no Apply button and no
partial-page filtering.

## Using it

1. Pick a source from the **Source** dropdown.
2. Click **Read** on first use for that source.
3. Filter with the **Filters** button. Remove an active filter by clicking its chip.
4. Save a combination as a view when you want to come back to it.
5. Star interesting programs. Edit status and notes from the detail pane or the **Saved** tab.
6. Use **CSV** to export exactly what is on screen.

Keyboard: `/` focuses the bounty search.

## Filter semantics

- **Payout** compares against the program's top payout.
- **Type** — leave all unchecked to include every type.
- **Reports** — minimum resolved reports, where the source provides the figure.
- **Response** — minimum response-efficiency percentage; HackerOne provides this.
- **Launched after** — four-digit year, where the source provides a launch date.
- **Keywords** — comma or space separated. Include terms must all match; exclude terms must
  none match. Matching covers name, handle, platform, type and tags.

## App updates

The installed build checks public GitHub Releases (`Grymm9/Shrike`) and can download and
install a newer version from **Settings → App updates**.

- **Check on launch** is on by default. It only notifies; nothing downloads until you click.
- **Check for updates** → **Download v…** → **Restart and install**.
- The NSIS installer replaces the app files only. Saved views, shortlist notes and caches are
  never deleted or replaced.
- Before installing, `views.json` and `shortlist.json` are copied to `config/backups/`.
- Only the installed build can self-update. There is no portable build.
- The repository and its releases must be public; the updater needs no token.
- First install of 2.2.0 is manual. Versions after that can update in place.

## Publishing a release

From a clean version bump:

```
npm version patch
npm run release        # needs GH_TOKEN with repo access
```

Or push a tag and let GitHub Actions build and publish:

```
git push
git tag v2.2.1
git push origin v2.2.1
```

`.github/workflows/release.yml` runs typecheck/tests, builds the installer, and publishes
`Shrike-Setup-<version>.exe`, its blockmap and `latest.yml` to GitHub Releases. The release
must be published, not a draft, before other installs can see it.

## Local storage

| Mode | Workspace |
| --- | --- |
| Packaged app | `%USERPROFILE%\Documents\Shrike` (`~/Documents/Shrike` elsewhere) |
| `npm run dev` | `<project>\.shrike-workspace` |
| Override | `SHRIKE_WORKSPACE=/path/to/workspace` |

```
<workspace>/
  config/bounties.json             # HackerOne cache
  config/bounties-bugcrowd.json    # Bugcrowd cache
  config/bounties-yeswehack.json   # YesWeHack cache
  config/views.json                # saved filter views
  config/shortlist.json            # saved programs, statuses and notes
  config/settings.json             # defaults and update preference
  config/backups/                  # pre-update copies of views/shortlist
  sessions/                        # old v1 engagement files (archive/delete in Settings)
  archive/engagements/             # archived v1 files
```

Atomic writes go to a temp file, `fsync`, then rename. Corrupt files fall back to defaults
instead of breaking startup.

## Upgrading from v1

v1 endpoint engagements are not deleted. They are listed in **Settings → Old engagement
files**, where each file can be archived to `archive/engagements/` or deleted. The endpoint
dashboard, scoring engine, import dialog, Rules section and Git sync are gone.

## Source limits

- **HackerOne** — public paying bounties and VDPs, payout/report/response/launch data.
- **Bugcrowd** — public bug bounty engagements, payout range and access status.
- **YesWeHack** — public programs, payout range and report count.
- Scope and asset types are not in these directory payloads. Open the program page for the
  full scope.
- Listings behind a login are unavailable. The reader sends no cookies and caches results.

## Development

```
npm run dev        # Vite dev server + Electron
npm test           # adapter, filter and store tests
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
electron/main.js              window, IPC, source refresh, CSV export
electron/preload.cjs          typed window.shrike bridge (contextIsolation + sandbox)
electron/lib/bounties.js      HackerOne, Bugcrowd and YesWeHack adapters
electron/lib/bountyFilters.js filtering, sorting, saved-view metadata
electron/lib/fetchPage.js     capped, redirect-checked HTTP reader
electron/lib/store.js         atomic JSON store, per-source caches, views, shortlist
electron/lib/updates.js       GitHub API/browser updater for the installed build
src/components/BountiesView   board, filters, detail pane, progress
src/components/Saved…         shortlist with status and notes
src/components/SettingsPanel  updates, preferences, archive/delete
tests/                        adapter, filter and store tests
```
