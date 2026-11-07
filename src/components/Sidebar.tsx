import type { View, GitState } from "../lib/types";
import { formatRelative, remoteHost } from "../lib/format";
import {
  IconDashboard,
  IconFolder,
  IconMark,
  IconRules,
  IconSessions,
} from "./Icons";

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
  sessionCount: number;
  rankCount: number;
  git: GitState | null;
  workspace: string;
  onOpenWorkspace: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  idle: "READY",
  working: "SYNCING",
  error: "SYNC ERROR",
  offline: "OFFLINE",
  behind: "BEHIND REMOTE",
};

export function Sidebar({
  view,
  onChange,
  sessionCount,
  rankCount,
  git,
  workspace,
  onOpenWorkspace,
}: SidebarProps) {
  const phase = git?.phase ?? "idle";

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <IconMark size={17} />
        </span>
        <span className="brand-text">
          <span className="brand-name">SHRIKE</span>
          <span className="brand-sub">Object-level triage</span>
        </span>
      </div>

      <nav className="nav" aria-label="Primary">
        <button
          type="button"
          className={"nav-item" + (view === "dashboard" ? " active" : "")}
          onClick={() => onChange("dashboard")}
        >
          <IconDashboard />
          <span className="nav-label">Dashboard</span>
          <span className="nav-count">{rankCount}</span>
        </button>
        <button
          type="button"
          className={"nav-item" + (view === "sessions" ? " active" : "")}
          onClick={() => onChange("sessions")}
        >
          <IconSessions />
          <span className="nav-label">Sessions</span>
          <span className="nav-count">{sessionCount}</span>
        </button>
        <button
          type="button"
          className={"nav-item" + (view === "rules" ? " active" : "")}
          onClick={() => onChange("rules")}
        >
          <IconRules />
          <span className="nav-label">Rules &amp; sync</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />

      <section className="sync-card" aria-label="Sync status">
        <header className="sync-card-head">
          <span className={`status-dot phase-${phase}`} />
          <span className="micro-label">{PHASE_LABEL[phase] ?? phase.toUpperCase()}</span>
        </header>
        <p className="sync-message" title={git?.message}>
          {git?.message ?? "Initialising"}
        </p>
        <dl className="sync-meta">
          <div>
            <dt>Remote</dt>
            <dd title={git?.remote ?? undefined}>{remoteHost(git?.remote ?? null)}</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>{formatRelative(git?.lastSyncAt ?? null)}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>{git?.branch ?? "main"}</dd>
          </div>
        </dl>
        <button type="button" className="btn ghost tiny full" onClick={onOpenWorkspace}>
          <IconFolder size={12} />
          Open workspace
        </button>
      </section>

      <footer className="sidebar-foot">
        <span className="micro-label">v1.0.0</span>
        <span className="path-trunc" title={workspace}>
          {workspace}
        </span>
      </footer>
    </aside>
  );
}
