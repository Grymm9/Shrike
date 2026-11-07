export interface KeywordRule {
  value: string;
  weight: number;
}

export interface Weights {
  base: number;
  numericId: number;
  uuid: number;
  sensitiveParam: number;
  queryParam: number;
  depth: number;
}

export interface Rules {
  ignoredExtensions: string[];
  ignoredSegments: string[];
  keywords: KeywordRule[];
  sensitiveParams: string[];
  weights: Weights;
}

export interface Settings {
  schemaVersion: number;
  rules: Rules;
  sync: { autoPush: boolean };
}

export interface Reason {
  code: string;
  label: string;
  delta: number;
}

export interface FilterReason {
  code: "extension" | "segment";
  detail: string;
}

export interface Endpoint {
  id: string;
  method: string;
  host: string;
  path: string;
  query: string;
  url: string;
  template: string;
  depth: number;
  score: number;
  kept: boolean;
  reasons: Reason[];
  filterReason: FilterReason | null;
}

export interface Stats {
  lines: number;
  skipped: number;
  invalid: number;
  duplicates: number;
  ingested: number;
  kept: number;
  filtered: number;
  maxScore: number;
  avgScore: number;
}

export interface SessionSource {
  kind: string;
  name: string | null;
  importedAt: string;
}

export interface Session {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  rulesHash: string;
  rulesSnapshot: Rules;
  source: SessionSource;
  stats: Stats;
  endpoints: Endpoint[];
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  endpointCount: number;
  keptCount: number;
  filteredCount: number;
  maxScore: number;
  rulesHash: string;
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
  sessions: string;
  config: string;
}

export interface Bootstrap {
  settings: Settings;
  sessions: SessionMeta[];
  activeSession: Session | null;
  git: GitState;
  paths: WorkspacePaths;
  initialView: string | null;
}

export type View = "dashboard" | "sessions" | "rules";

export interface ToastItem {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}
