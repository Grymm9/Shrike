import type {
  BountyCache,
  LegacyEngagement,
  SavedViews,
  Settings,
  Shortlist,
  ShortlistStatus,
} from "../../src/lib/types";

export class Store {
  constructor(workspace: string);
  workspace: string;
  sessionsDir: string;
  configDir: string;
  archiveDir: string;
  settingsPath: string;
  gitStatePath: string;
  bountiesPath: string;
  viewsPath: string;
  shortlistPath: string;

  init(): Promise<void>;
  legacyPath(id: string): string;

  readSettings(): Promise<Settings>;
  writeSettings(settings: Settings): Promise<Settings>;
  setAutoPush(enabled: boolean): Promise<Settings>;
  setPrefs(prefs: Partial<Settings["prefs"]>): Promise<Settings>;

  readGitState(): Promise<{ lastSyncAt: string | null }>;
  writeGitState(state: { lastSyncAt: string | null }): Promise<void>;

  readBountyCache(): Promise<BountyCache>;
  writeBountyCache(cache: BountyCache): Promise<BountyCache>;

  readViews(): Promise<SavedViews>;
  writeViews(views: SavedViews): Promise<SavedViews>;

  readShortlist(): Promise<Shortlist>;
  writeShortlist(shortlist: Shortlist): Promise<Shortlist>;
  setShortlist(
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ): Promise<Shortlist>;
  removeShortlist(id: string): Promise<Shortlist>;
  backupSyncedData(): Promise<string>;

  listLegacy(): Promise<LegacyEngagement[]>;
  archiveLegacy(id: string): Promise<boolean>;
  deleteLegacy(id: string): Promise<boolean>;
  archiveAllLegacy(): Promise<LegacyEngagement[]>;
  deleteAllLegacy(): Promise<LegacyEngagement[]>;
}
