import type {
  Bootstrap,
  BountyCache,
  BountyFilters,
  BountySource,
  LegacyEngagement,
  RefreshProgress,
  SavedViews,
  Settings,
  Shortlist,
  ShortlistStatus,
  SortKey,
  UpdateState,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

interface ShrikeBridge {
  bootstrap(activeId?: string): Promise<Result<Bootstrap>>;
  openWorkspace(): Promise<Result<boolean>>;
  openExternal(url: string): Promise<Result<boolean>>;

  listBounties(source: BountySource): Promise<Result<BountyCache>>;
  refreshBounties(source: BountySource): Promise<Result<BountyCache>>;
  exportCsv(payload: {
    source: BountySource;
    filters: BountyFilters;
    sort: SortKey;
  }): Promise<Result<{ filePath: string; count: number } | null>>;

  setPrefs(
    prefs: Partial<Settings["prefs"]>,
  ): Promise<Result<{ settings: Settings }>>;

  updateState(): Promise<Result<UpdateState>>;
  checkForUpdates(): Promise<Result<UpdateState>>;
  downloadUpdate(): Promise<Result<UpdateState>>;
  installUpdate(): Promise<Result<boolean>>;

  saveViews(views: SavedViews): Promise<Result<SavedViews>>;
  setShortlist(payload: {
    id: string;
    status: ShortlistStatus;
    note?: string;
  }): Promise<Result<Shortlist>>;
  removeShortlist(id: string): Promise<Result<Shortlist>>;

  listLegacy(): Promise<Result<LegacyEngagement[]>>;
  archiveLegacy(id: string): Promise<Result<LegacyEngagement[]>>;
  deleteLegacy(id: string): Promise<Result<LegacyEngagement[]>>;
  archiveAllLegacy(): Promise<Result<LegacyEngagement[]>>;
  deleteAllLegacy(): Promise<Result<LegacyEngagement[]>>;

  onBountiesChanged(callback: (cache: BountyCache) => void): () => void;
  onBountyProgress(callback: (progress: RefreshProgress) => void): () => void;
  onUpdateStatus(callback: (state: UpdateState) => void): () => void;
}

declare global {
  interface Window {
    shrike: ShrikeBridge;
  }
}

export const api = {
  bootstrap: (activeId?: string) => unwrap(window.shrike.bootstrap(activeId)),
  openWorkspace: () => unwrap(window.shrike.openWorkspace()),
  openExternal: (url: string) => unwrap(window.shrike.openExternal(url)),

  listBounties: (source: BountySource) => unwrap(window.shrike.listBounties(source)),
  refreshBounties: (source: BountySource) =>
    unwrap(window.shrike.refreshBounties(source)),
  exportCsv: (payload: { source: BountySource; filters: BountyFilters; sort: SortKey }) =>
    unwrap(window.shrike.exportCsv(payload)),

  setPrefs: (prefs: Partial<Settings["prefs"]>) => unwrap(window.shrike.setPrefs(prefs)),

  updateState: () => unwrap(window.shrike.updateState()),
  checkForUpdates: () => unwrap(window.shrike.checkForUpdates()),
  downloadUpdate: () => unwrap(window.shrike.downloadUpdate()),
  installUpdate: () => unwrap(window.shrike.installUpdate()),

  saveViews: (views: SavedViews) => unwrap(window.shrike.saveViews(views)),
  setShortlist: (payload: { id: string; status: ShortlistStatus; note?: string }) =>
    unwrap(window.shrike.setShortlist(payload)),
  removeShortlist: (id: string) => unwrap(window.shrike.removeShortlist(id)),

  listLegacy: () => unwrap(window.shrike.listLegacy()),
  archiveLegacy: (id: string) => unwrap(window.shrike.archiveLegacy(id)),
  deleteLegacy: (id: string) => unwrap(window.shrike.deleteLegacy(id)),
  archiveAllLegacy: () => unwrap(window.shrike.archiveAllLegacy()),
  deleteAllLegacy: () => unwrap(window.shrike.deleteAllLegacy()),

  onBountiesChanged: (callback: (cache: BountyCache) => void) =>
    window.shrike.onBountiesChanged(callback),
  onBountyProgress: (callback: (progress: RefreshProgress) => void) =>
    window.shrike.onBountyProgress(callback),
  onUpdateStatus: (callback: (state: UpdateState) => void) =>
    window.shrike.onUpdateStatus(callback),
};
