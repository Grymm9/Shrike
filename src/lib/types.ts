export type BountyType = "bounty" | "vdp" | "external";

export type SortKey =
  | "maxBounty"
  | "minBounty"
  | "reports"
  | "responseEfficiency"
  | "launched"
  | "name";

export interface Bounty {
  id: string;
  source: "hackerone";
  handle: string;
  name: string;
  url: string;
  platform: string;
  description: string | null;
  currency: string | null;
  minBounty: number | null;
  maxBounty: number | null;
  averageBounty: number | null;
  reports: number | null;
  responseEfficiency: number | null;
  launchedAt: string | null;
  type: BountyType;
  tags: string[];
}

export interface BountyFilters {
  query: string;
  minBounty: number | null;
  maxBounty: number | null;
  types: BountyType[];
  minReports: number | null;
  minResponseEfficiency: number | null;
  launchedAfter: string | null;
  includeKeywords: string;
  excludeKeywords: string;
  shortlistedOnly: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filters: BountyFilters;
  sort: SortKey;
}

export interface SavedViews {
  schemaVersion: number;
  views: SavedView[];
}

export type ShortlistStatus = "interested" | "working" | "submitted";

export interface ShortlistEntry {
  id: string;
  status: ShortlistStatus;
  note: string;
  savedAt: string;
}

export interface Shortlist {
  schemaVersion: number;
  items: Record<string, ShortlistEntry>;
}

export interface BountyCache {
  schemaVersion: number;
  source: "hackerone";
  fetchedAt: string | null;
  scanned: number;
  programs: Bounty[];
}

export interface Settings {
  schemaVersion: number;
  sync: { autoPush: boolean };
  prefs: {
    cacheMinutes: number;
    defaultSort: SortKey;
    defaultViewId: string | null;
    autoCheckUpdates: boolean;
  };
}

export type GitPhase = "idle" | "working" | "error" | "offline" | "behind";

export interface GitState {
  phase: GitPhase;
  action: "push" | "pull" | null;
  message: string;
  lastSyncAt: string | null;
  remote: string | null;
  branch: string;
  autoPush: boolean;
  repo: string;
  hasRepo: boolean;
}

export interface WorkspacePaths {
  workspace: string;
  config: string;
}

export interface LegacyEngagement {
  id: string;
  name: string;
  endpointCount: number;
  updatedAt: string;
}

export type UpdatePhase =
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "current"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateState {
  status: UpdatePhase;
  currentVersion: string;
  version: string | null;
  notes: string | null;
  percent: number;
  message: string;
  packaged: boolean;
}

export interface Bootstrap {
  version: string;
  settings: Settings;
  bounties: BountyCache;
  views: SavedViews;
  shortlist: Shortlist;
  git: GitState;
  paths: WorkspacePaths;
  legacy: LegacyEngagement[];
  update: UpdateState;
  initialView: string | null;
}

export type View = "bounties" | "saved" | "settings";

export interface ToastItem {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

export interface RefreshProgress {
  phase: "bounty" | "vdp" | "done";
  page: number;
  loaded: number;
  total: number;
}
