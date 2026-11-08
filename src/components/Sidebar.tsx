import type { View, GitState } from "../lib/types";
import { formatRelative, remoteHost } from "../lib/format";
import {
  IconFolder,
  IconMark,
  IconPrograms,
  IconSettings,
  IconStar,
} from "./Icons";

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
  bountyCount: number;
  savedCount: number;
  git: GitState | null;
  version: string;
  workspace: string;
  onOpenWorkspace: () => void;
}

function phaseLabel(git: GitState | null): string {
  const phase = git?.phase ?? "idle";
  if (phase === "working") return "SYNCING";
  if (phase === "error") return "SYNC ERROR";
  if (phase === "offline") return "OFFLINE";
  if (phase === "behind") return "PULL NEEDED";
  return git?.remote ? "UP TO DATE" : "LOCAL ONLY";
}

export function Sidebar({
  view,
  onChange,
  bountyCount,
  savedCount,
  git,
  version,
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
          <span className="brand-sub">Bounty discovery</span>
        </span>
      </div>

      <nav className="nav" aria-label="Primary">
        <button
          type="button"
          className={"nav-item" + (view === "bounties" ? " active" : "")}
          onClick={() => onChange("bounties")}
        >
          <IconPrograms />
          <span className="nav-label">Bounties</span>
          <span className="nav-count">{bountyCount}</span>
        </button>
        <button
          type="button"
          className={"nav-item" + (view === "saved" ? " active" : "")}
          onClick={() => onChange("saved")}
        >
          <IconStar />
          <span className="nav-label">Saved</span>
          <span className="nav-count">{savedCount}</span>
        </button>
        <button
          type="button"
          className={"nav-item" + (view === "settings" ? " active" : "")}
          onClick={() => onChange("settings")}
        >
          <IconSettings />
          <span className="nav-label">Settings</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />

      <section className="sync-card" aria-label="Sync status">
        <header className="sync-card-head">
          <span className={`status-dot phase-${phase}`} />
          <span className="micro-label">{phaseLabel(git)}</span>
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
          <IconFolder size={14} />
          Open workspace
        </button>
      </section>

      <footer className="sidebar-foot">
        <span className="micro-label">v{version || "2.1.0"}</span>
        <span className="path-trunc" title={workspace}>
          {workspace}
        </span>
      </footer>
    </aside>
  );
}
