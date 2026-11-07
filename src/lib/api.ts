import type {
  Bootstrap,
  GitState,
  Rules,
  Session,
  SessionMeta,
  Settings,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export interface IngestPayload {
  id: string;
  raw: string;
  mode: "replace" | "append";
  sourceName?: string | null;
}

export interface MutationResult {
  session?: Session;
  sessions: SessionMeta[];
}

interface ShrikeBridge {
  bootstrap(activeId?: string): Promise<Result<Bootstrap>>;
  openSessionsDir(): Promise<Result<boolean>>;
  openWorkspace(): Promise<Result<boolean>>;

  saveRules(
    rules: Rules,
    activeSessionId?: string | null,
  ): Promise<Result<{ settings: Settings; session: Session | null; sessions: SessionMeta[] }>>;
  resetRules(
    activeSessionId?: string | null,
  ): Promise<Result<{ settings: Settings; session: Session | null; sessions: SessionMeta[] }>>;
  setAutoPush(
    enabled: boolean,
  ): Promise<Result<{ settings: Settings; git: GitState }>>;

  pushNow(): Promise<Result<{ git: GitState }>>;
  pullNow(): Promise<Result<{ git: GitState; sessions: SessionMeta[] }>>;
  setRemote(url: string): Promise<Result<{ git: GitState }>>;

  listSessions(): Promise<Result<SessionMeta[]>>;
  createSession(name: string): Promise<Result<{ session: Session; sessions: SessionMeta[] }>>;
  getSession(id: string): Promise<Result<Session>>;
  renameSession(
    id: string,
    name: string,
  ): Promise<Result<{ session: Session; sessions: SessionMeta[] }>>;
  deleteSession(id: string): Promise<Result<{ sessions: SessionMeta[] }>>;
  ingest(payload: IngestPayload): Promise<Result<{ session: Session; sessions: SessionMeta[] }>>;
  rescore(
    id: string,
  ): Promise<Result<{ session: Session; sessions: SessionMeta[] }>>;

  onSyncStatus(callback: (state: GitState) => void): () => void;
  onSessionsChanged(callback: (sessions: SessionMeta[]) => void): () => void;
}

declare global {
  interface Window {
    shrike: ShrikeBridge;
  }
}

export const api = {
  bootstrap: (activeId?: string) => unwrap(window.shrike.bootstrap(activeId)),
  openSessionsDir: () => unwrap(window.shrike.openSessionsDir()),
  openWorkspace: () => unwrap(window.shrike.openWorkspace()),

  saveRules: (rules: Rules, activeSessionId?: string | null) =>
    unwrap(window.shrike.saveRules(rules, activeSessionId)),
  resetRules: (activeSessionId?: string | null) =>
    unwrap(window.shrike.resetRules(activeSessionId)),
  setAutoPush: (enabled: boolean) => unwrap(window.shrike.setAutoPush(enabled)),

  pushNow: () => unwrap(window.shrike.pushNow()),
  pullNow: () => unwrap(window.shrike.pullNow()),
  setRemote: (url: string) => unwrap(window.shrike.setRemote(url)),

  listSessions: () => unwrap(window.shrike.listSessions()),
  createSession: (name: string) => unwrap(window.shrike.createSession(name)),
  getSession: (id: string) => unwrap(window.shrike.getSession(id)),
  renameSession: (id: string, name: string) => unwrap(window.shrike.renameSession(id, name)),
  deleteSession: (id: string) => unwrap(window.shrike.deleteSession(id)),
  ingest: (payload: IngestPayload) => unwrap(window.shrike.ingest(payload)),
  rescore: (id: string) => unwrap(window.shrike.rescore(id)),

  onSyncStatus: (callback: (state: GitState) => void) => window.shrike.onSyncStatus(callback),
  onSessionsChanged: (callback: (sessions: SessionMeta[]) => void) =>
    window.shrike.onSessionsChanged(callback),
};
