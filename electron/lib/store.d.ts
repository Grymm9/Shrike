import type { Rules } from "./rules.js";
import type { SessionShape } from "./ingest.js";

export interface Settings {
  schemaVersion: number;
  rules: Rules;
  sync: { autoPush: boolean };
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

export class Store {
  constructor(workspace: string);
  workspace: string;
  sessionsDir: string;
  configDir: string;
  settingsPath: string;
  gitStatePath: string;
  init(): Promise<void>;
  sessionPath(id: string): string;
  readSettings(): Promise<Settings>;
  writeSettings(settings: Settings): Promise<Settings>;
  setRules(rules: Rules): Promise<Settings>;
  setAutoPush(enabled: boolean): Promise<Settings>;
  readGitState(): Promise<{ lastSyncAt: string | null }>;
  writeGitState(state: { lastSyncAt: string | null }): Promise<void>;
  listSessions(): Promise<SessionMeta[]>;
  readSession(id: string): Promise<SessionShape>;
  writeSession(session: SessionShape): Promise<SessionShape>;
  createSession(name: string): Promise<SessionShape>;
  renameSession(id: string, name: string): Promise<SessionShape>;
  deleteSession(id: string): Promise<void>;
  ingest(
    id: string,
    raw: string,
    mode: "replace" | "append",
    sourceName: string | null,
  ): Promise<SessionShape>;
  rescore(id: string): Promise<SessionShape>;
  rescoreAll(): Promise<SessionShape[]>;
}
