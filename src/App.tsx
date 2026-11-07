import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import type {
  GitState,
  Rules,
  Session,
  SessionMeta,
  Settings,
  ToastItem,
  View,
  WorkspacePaths,
} from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Dashboard } from "./components/Dashboard";
import { SessionsPanel } from "./components/SessionsPanel";
import { RulesPanel } from "./components/RulesPanel";
import { IngestDialog } from "./components/IngestDialog";
import { Toasts } from "./components/Toasts";

const TITLES: Record<View, string> = {
  dashboard: "Triage dashboard",
  sessions: "Sessions",
  rules: "Rules & sync",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [git, setGit] = useState<GitState | null>(null);
  const [paths, setPaths] = useState<WorkspacePaths | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toastSeq = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = session?.id ?? null;
  }, [session?.id]);

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
        setSessions(boot.sessions);
        setSession(boot.activeSession);
        setGit(boot.git);
        setPaths(boot.paths);
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
    const offSync = api.onSyncStatus((state) => setGit(state));
    const offSessions = api.onSessionsChanged(async (list) => {
      setSessions(list);
      const activeId = activeIdRef.current;
      if (!activeId) return;
      try {
        const reloaded = await api.getSession(activeId);
        setSession(reloaded);
      } catch {
        setSession(null);
      }
    });
    return () => {
      offSync();
      offSessions();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (activeIdRef.current) setDialog(true);
      }
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

  async function openSession(id: string) {
    await run("session", async () => {
      const loaded = await api.getSession(id);
      setSession(loaded);
      setView("dashboard");
      return loaded;
    });
  }

  async function createSession(name: string) {
    await run("session", async () => {
      const result = await api.createSession(name);
      setSession(result.session);
      setSessions(result.sessions);
      setView("dashboard");
      toast("success", `Session “${result.session.name}” created`);
      return result;
    });
  }

  async function renameSession(id: string, name: string) {
    await run("session", async () => {
      const result = await api.renameSession(id, name);
      setSessions(result.sessions);
      if (session?.id === id) setSession(result.session);
      toast("success", "Session renamed");
      return result;
    });
  }

  async function deleteSession(id: string) {
    await run("session", async () => {
      const result = await api.deleteSession(id);
      setSessions(result.sessions);
      if (session?.id === id) {
        setSession(null);
        const next = result.sessions[0];
        if (next) {
          const loaded = await api.getSession(next.id);
          setSession(loaded);
        }
      }
      toast("success", "Session deleted");
      return result;
    });
  }

  async function importEndpoints(payload: {
    raw: string;
    mode: "replace" | "append";
    sourceName: string | null;
  }) {
    if (!session) return;
    await run("import", async () => {
      const result = await api.ingest({ id: session.id, ...payload });
      setSession(result.session);
      setSessions(result.sessions);
      setDialog(false);
      const { kept, filtered, ingested } = result.session.stats;
      toast("success", `${kept} ranked of ${ingested} · ${filtered} filtered`);
      return result;
    });
  }

  async function saveRules(rules: Rules) {
    await run("rules", async () => {
      const result = await api.saveRules(rules, session?.id ?? null);
      setSettings(result.settings);
      setSessions(result.sessions);
      if (result.session) setSession(result.session);
      toast(
        "success",
        result.session
          ? `Rules saved · ${result.session.stats.kept} endpoints re-scored`
          : "Rules saved",
      );
      return result;
    });
  }

  async function resetRules() {
    await run("rules", async () => {
      const result = await api.resetRules(session?.id ?? null);
      setSettings(result.settings);
      setSessions(result.sessions);
      if (result.session) setSession(result.session);
      toast("success", "Rules reset to defaults");
      return result;
    });
  }

  async function setRemote(url: string) {
    await run("remote", async () => {
      const result = await api.setRemote(url);
      setGit(result.git);
      toast("success", "Remote saved");
      return result;
    });
  }

  async function setAutoPush(enabled: boolean) {
    await run("remote", async () => {
      const result = await api.setAutoPush(enabled);
      setSettings(result.settings);
      setGit(result.git);
      toast("info", `Auto-push ${enabled ? "enabled" : "disabled"}`);
      return result;
    });
  }

  async function pull() {
    await run("pull", async () => {
      const result = await api.pullNow();
      setGit(result.git);
      setSessions(result.sessions);
      const activeId = session?.id;
      if (activeId) {
        try {
          setSession(await api.getSession(activeId));
        } catch {
          setSession(null);
        }
      }
      toast("success", result.git.message);
      return result;
    });
  }

  async function push() {
    await run("push", async () => {
      const result = await api.pushNow();
      setGit(result.git);
      toast(result.git.phase === "error" ? "error" : "success", result.git.message);
      return result;
    });
  }

  async function rescore() {
    if (!session) return;
    await run("rescore", async () => {
      const result = await api.rescore(session.id);
      setSession(result.session);
      setSessions(result.sessions);
      toast("success", `Re-scored ${result.session.stats.kept} endpoints`);
      return result;
    });
  }

  if (fatal) {
    return (
      <div className="fatal">
        <span className="micro-label">Startup failure</span>
        <h1>Shrike could not start</h1>
        <pre>{fatal}</pre>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="boot">
        <span className="micro-label">Shrike</span>
        <span className="boot-line" />
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        onChange={setView}
        sessionCount={sessions.length}
        rankCount={session?.stats.kept ?? 0}
        git={git}
        workspace={paths?.workspace ?? ""}
        onOpenWorkspace={() => {
          void api.openWorkspace().catch((error) => toast("error", messageOf(error)));
        }}
      />

      <div className="main">
        <Topbar
          title={TITLES[view]}
          sessionName={session?.name ?? null}
          git={git}
          busy={busy}
          canImport={Boolean(session)}
          onPull={() => void pull()}
          onPush={() => void push()}
          onImport={() => setDialog(true)}
        />

        <div className="content">
          {view === "dashboard" ? (
            <Dashboard
              session={session}
              busy={busy}
              onImport={() => setDialog(true)}
              onRescore={() => void rescore()}
              onCreate={() => void createSession("Untitled session")}
            />
          ) : null}

          {view === "sessions" ? (
            <SessionsPanel
              sessions={sessions}
              activeId={session?.id ?? null}
              rules={settings.rules}
              busy={busy}
              onOpen={(id) => void openSession(id)}
              onCreate={(name) => void createSession(name)}
              onRename={(id, name) => void renameSession(id, name)}
              onDelete={(id) => void deleteSession(id)}
            />
          ) : null}

          {view === "rules" ? (
            <RulesPanel
              settings={settings}
              session={session}
              git={git}
              busy={busy}
              workspace={paths?.workspace ?? ""}
              onSave={(rules) => void saveRules(rules)}
              onReset={() => void resetRules()}
              onSetRemote={(url) => void setRemote(url)}
              onSetAutoPush={(enabled) => void setAutoPush(enabled)}
              onPush={() => void push()}
              onOpenWorkspace={() => {
                void api.openWorkspace().catch((error) => toast("error", messageOf(error)));
              }}
            />
          ) : null}
        </div>
      </div>

      {dialog && session ? (
        <IngestDialog
          session={session}
          rules={settings.rules}
          busy={busy === "import"}
          onClose={() => setDialog(false)}
          onSubmit={(payload) => void importEndpoints(payload)}
        />
      ) : null}

      <Toasts items={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      {busy ? <div className="busy-line" aria-hidden="true" /> : null}
    </div>
  );
}
