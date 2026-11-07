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

export interface GitSyncOptions {
  repo: string;
  onStatus?: (state: GitState) => void;
  autoPush?: boolean;
  lastSyncAt?: string | null;
}

export class GitSync {
  constructor(options: GitSyncOptions);
  getState(): GitState;
  init(): Promise<GitState>;
  hasCommits(): Promise<boolean>;
  setAutoPush(enabled: boolean): void;
  schedulePush(message?: string): void;
  flush(): Promise<GitState>;
  pushNow(message?: string): Promise<GitState>;
  pullNow(): Promise<GitState>;
  setRemote(url: string): Promise<GitState>;
}

export function delay(ms: number): Promise<void>;
