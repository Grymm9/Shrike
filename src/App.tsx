import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { emptyFilters } from "../electron/lib/bountyFilters.js";
import type {
  Bounty,
  BountyCache,
  BountyCaches,
  BountyFilters,
  BountySource,
  LegacyEngagement,
  RefreshProgress,
  SavedView,
  SavedViews,
  Settings,
  Shortlist,
  ShortlistStatus,
  SortKey,
  ToastItem,
  UpdateState,
  View,
  WorkspacePaths,
} from "./lib/types";
import { BOUNTY_SOURCES } from "./lib/types";
import { plural } from "./lib/format";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { BountiesView } from "./components/BountiesView";
import { SavedBountiesView } from "./components/SavedBountiesView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toasts } from "./components/Toasts";
import { AppSkeleton } from "./components/Skeleton";

const TITLES: Record<View, string> = {
  bounties: "Bounties",
  saved: "Saved",
  settings: "Settings",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyCaches(): BountyCaches {
  return {
    hackerone: emptyCache("hackerone"),
    bugcrowd: emptyCache("bugcrowd"),
    yeswehack: emptyCache("yeswehack"),
  };
}

function emptyCache(source: BountySource): BountyCache {
  return {
    schemaVersion: 1,
    source,
    fetchedAt: null,
    scanned: 0,
    programs: [],
  };
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [caches, setCaches] = useState<BountyCaches>(emptyCaches);
  const [source, setSource] = useState<BountySource>("hackerone");
  const bounties = caches[source];
  const [views, setViews] = useState<SavedViews>({ schemaVersion: 1, views: [] });
  const [shortlist, setShortlist] = useState<Shortlist>({ schemaVersion: 1, items: {} });
  const [paths, setPaths] = useState<WorkspacePaths | null>(null);
  const [legacy, setLegacy] = useState<LegacyEngagement[]>([]);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [view, setView] = useState<View>("bounties");
  const [busy, setBusy] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [filters, setFiltersState] = useState<BountyFilters>(emptyFilters);
  const [sort, setSort] = useState<SortKey>("maxBounty");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [progress, setProgress] = useState<RefreshProgress | null>(null);

  const toastSeq = useRef(0);

  const toast = useCallback((kind: ToastItem["kind"], message: string) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4600);
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .bootstrap()
      .then((boot) => {
        if (!alive) return;
        setSettings(boot.settings);
        setCaches(boot.bounties);
        setSource("hackerone");
        setViews(boot.views);
        setShortlist(boot.shortlist);
        setPaths(boot.paths);
        setLegacy(boot.legacy);
        setVersion(boot.version);
        setUpdate(boot.update);

        const saved = boot.views.views.find(
          (item) => item.id === boot.settings.prefs.defaultViewId,
        );
        if (saved) {
          setFiltersState(saved.filters);
          setSort(saved.sort);
          setActiveViewId(saved.id);
        } else {
          setSort(boot.settings.prefs.defaultSort);
        }

        if (boot.initialView && boot.initialView in TITLES) {
          setView(boot.initialView as View);
        }
      })
      .catch((error) => {
        if (alive) setFatal(messageOf(error));
      })
      .finally(() => {
        document.documentElement.dataset.ready = "1";
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const offProgress = api.onBountyProgress((next) => {
      if (next.phase === "done") {
        setProgress(null);
        return;
      }
      setProgress(next);
    });
    const offUpdate = api.onUpdateStatus((state) => setUpdate(state));
    return () => {
      offProgress();
      offUpdate();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      document.querySelector<HTMLInputElement>(".toolbar .search input")?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function run<T>(key: string, task: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      return await task();
    } catch (error) {
      toast("error", messageOf(error));
      return null;
    } finally {
      setBusy(null);
    }
  }

  function setFilters(next: BountyFilters) {
    setFiltersState(next);
    setActiveViewId(null);
  }

  function changeSource(next: BountySource) {
    if (next === source) return;
    setSource(next);
    setActiveViewId(null);
  }

  async function refreshBounties() {
    if (busy) return;
    setBusy("refresh");
    setProgress({ phase: "programs", source, page: 1, loaded: 0, total: 0 });
    try {
      const cache = await api.refreshBounties(source);
      setCaches((current) => ({ ...current, [source]: cache }));
      const label = BOUNTY_SOURCES.find((item) => item.id === source)?.label ?? "source";
      toast("success", `Read ${plural(cache.scanned, "bounty", "bounties")} from ${label}`);
    } catch (error) {
      toast("error", messageOf(error));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function exportCsv() {
    await run("export", async () => {
      const result = await api.exportCsv({ source, filters, sort });
      if (!result) return null;
      toast(
        "success",
        `Exported ${plural(result.count, "bounty", "bounties")} to ${result.filePath}`,
      );
      return result;
    });
  }

  async function applyView(next: SavedView | null) {
    if (!next) {
      setActiveViewId(null);
      const result = await api.setPrefs({ defaultViewId: null }).catch(() => null);
      if (result) setSettings(result.settings);
      return;
    }
    setFiltersState(next.filters);
    setSort(next.sort);
    setActiveViewId(next.id);
    const result = await api.setPrefs({ defaultViewId: next.id }).catch(() => null);
    if (result) setSettings(result.settings);
  }

  async function saveView(name: string) {
    await run("view", async () => {
      const id = activeViewId ?? `view-${Date.now().toString(36)}`;
      const next: SavedView = { id, name, filters, sort };
      const exists = views.views.some((item) => item.id === id);
      const nextViews = exists
        ? views.views.map((item) => (item.id === id ? next : item))
        : [...views.views, next];

      const saved = await api.saveViews({ schemaVersion: 1, views: nextViews });
      setViews(saved);
      setActiveViewId(id);
      const pref = await api.setPrefs({ defaultViewId: id }).catch(() => null);
      if (pref) setSettings(pref.settings);
      toast("success", exists ? `View “${name}” updated` : `View “${name}” saved`);
      return saved;
    });
  }

  async function deleteView(id: string) {
    await run("view", async () => {
      const saved = await api.saveViews({
        schemaVersion: 1,
        views: views.views.filter((item) => item.id !== id),
      });
      setViews(saved);
      if (activeViewId === id) {
        setActiveViewId(null);
        const pref = await api.setPrefs({ defaultViewId: null }).catch(() => null);
        if (pref) setSettings(pref.settings);
      }
      toast("success", "View deleted");
      return saved;
    });
  }

  async function toggleSave(bounty: Bounty) {
    await run("save", async () => {
      if (shortlist.items[bounty.id]) {
        const next = await api.removeShortlist(bounty.id);
        setShortlist(next);
        toast("info", `Removed ${bounty.name} from saved`);
        return next;
      }
      const next = await api.setShortlist({
        id: bounty.id,
        status: "interested",
        note: shortlist.items[bounty.id]?.note ?? "",
      });
      setShortlist(next);
      toast("success", `Saved ${bounty.name}`);
      return next;
    });
  }

  async function updateSaved(
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ) {
    const existing = shortlist.items[id];
    await run("save", async () => {
      const next = await api.setShortlist({
        id,
        status: patch.status ?? existing?.status ?? "interested",
        note: patch.note ?? existing?.note ?? "",
      });
      setShortlist(next);
      return next;
    });
  }

  async function removeSaved(id: string) {
    await run("save", async () => {
      const next = await api.removeShortlist(id);
      setShortlist(next);
      toast("info", "Removed from saved");
      return next;
    });
  }

  async function setPrefs(prefs: Partial<Settings["prefs"]>) {
    await run("prefs", async () => {
      const result = await api.setPrefs(prefs);
      setSettings(result.settings);
      if (prefs.defaultViewId !== undefined) {
        const next = views.views.find((item) => item.id === prefs.defaultViewId) ?? null;
        if (next) {
          setFiltersState(next.filters);
          setSort(next.sort);
          setActiveViewId(next.id);
        } else {
          setActiveViewId(null);
        }
      }
      return result;
    });
  }

  async function archiveLegacy(id: string) {
    await run("legacy", async () => {
      const next = await api.archiveLegacy(id);
      setLegacy(next);
      toast("success", "Engagement archived");
      return next;
    });
  }

  async function deleteLegacy(id: string) {
    await run("legacy", async () => {
      const next = await api.deleteLegacy(id);
      setLegacy(next);
      toast("success", "Engagement deleted");
      return next;
    });
  }

  async function archiveAllLegacy() {
    await run("legacy", async () => {
      const next = await api.archiveAllLegacy();
      setLegacy(next);
      toast("success", "Old engagements archived");
      return next;
    });
  }

  async function deleteAllLegacy() {
    await run("legacy", async () => {
      const next = await api.deleteAllLegacy();
      setLegacy(next);
      toast("success", "Old engagements deleted");
      return next;
    });
  }

  async function checkUpdate() {
    await run("update", async () => {
      const state = await api.checkForUpdates();
      setUpdate(state);
      if (state.status === "error") toast("error", state.message);
      else if (state.status === "available") toast("info", `Version ${state.version} is available`);
      else if (state.status === "current") toast("success", state.message);
      return state;
    });
  }

  async function downloadUpdate() {
    await run("update", async () => {
      const state = await api.downloadUpdate();
      setUpdate(state);
      if (state.status === "error") toast("error", state.message);
      return state;
    });
  }

  async function installUpdate() {
    try {
      await api.installUpdate();
    } catch (error) {
      toast("error", messageOf(error));
    }
  }

  async function openExternal(url: string) {
    await api.openExternal(url).catch((error) => toast("error", messageOf(error)));
  }

  async function openWorkspace() {
    await api.openWorkspace().catch((error) => toast("error", messageOf(error)));
  }

  function openReleases() {
    void openExternal("https://github.com/Grymm9/Shrike/releases");
  }

  if (fatal) {
    return (
      <div className="fatal">
        <span className="micro-label">Shrike could not open</span>
        <h1>The workspace did not load</h1>
        <p>
          Close Shrike and open it again. If it keeps failing, the details below point at the
          file or folder that is blocking startup.
        </p>
        <pre>{fatal}</pre>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (!settings || !update) {
    return <AppSkeleton />;
  }

  const fetchedTime = bounties.fetchedAt ? Date.parse(bounties.fetchedAt) : Number.NaN;
  const cacheStale =
    Number.isFinite(fetchedTime) &&
    Date.now() - fetchedTime > settings.prefs.cacheMinutes * 60_000;

  return (
    <div className="app">
      <Sidebar
        view={view}
        onChange={setView}
        bountyCount={bounties.scanned}
        savedCount={Object.keys(shortlist.items).length}
        version={version}
        workspace={paths?.workspace ?? ""}
        onOpenWorkspace={() => void openWorkspace()}
      />

      <div className="main">
        <Topbar
          title={TITLES[view]}
          update={update}
          onOpenUpdates={() => setView("settings")}
        />

        <div className="content">
          {view === "bounties" ? (
            <BountiesView
              cache={bounties}
              source={source}
              sources={BOUNTY_SOURCES}
              filters={filters}
              sort={sort}
              views={views}
              activeViewId={activeViewId}
              shortlist={shortlist}
              busy={busy}
              progress={progress}
              stale={cacheStale}
              onSourceChange={(next) => void changeSource(next)}
              onFilters={setFilters}
              onSort={(next) => {
                setSort(next);
                setActiveViewId(null);
              }}
              onApplyView={(next) => void applyView(next)}
              onSaveView={(name) => void saveView(name)}
              onDeleteView={(id) => void deleteView(id)}
              onRefresh={() => void refreshBounties()}
              onExport={() => void exportCsv()}
              onOpen={(url) => void openExternal(url)}
              onToggleSave={(bounty) => void toggleSave(bounty)}
              onUpdateSaved={(id, patch) => void updateSaved(id, patch)}
            />
          ) : null}

          {view === "saved" ? (
            <SavedBountiesView
              caches={caches}
              shortlist={shortlist}
              onOpen={(url) => void openExternal(url)}
              onUpdateSaved={(id, patch) => void updateSaved(id, patch)}
              onRemove={(id) => void removeSaved(id)}
              onBrowse={() => setView("bounties")}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsPanel
              version={version}
              settings={settings}
              paths={paths ?? { workspace: "", config: "" }}
              legacy={legacy}
              views={views}
              cache={bounties}
              update={update}
              busy={busy}
              onSetPrefs={(prefs) => void setPrefs(prefs)}
              onRefreshBounties={() => void refreshBounties()}
              onOpenWorkspace={() => void openWorkspace()}
              onCheckUpdate={() => void checkUpdate()}
              onDownloadUpdate={() => void downloadUpdate()}
              onInstallUpdate={() => void installUpdate()}
              onOpenReleases={openReleases}
              onArchiveLegacy={(id) => void archiveLegacy(id)}
              onDeleteLegacy={(id) => void deleteLegacy(id)}
              onArchiveAllLegacy={() => void archiveAllLegacy()}
              onDeleteAllLegacy={() => void deleteAllLegacy()}
            />
          ) : null}
        </div>
      </div>

      <Toasts items={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      {busy ? <div className="busy-line" aria-hidden="true" /> : null}
    </div>
  );
}
