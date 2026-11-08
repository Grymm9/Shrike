import type { View } from "../lib/types";
import logoUrl from "../assets/logo.png";
import { IconFolder, IconPrograms, IconSettings, IconStar } from "./Icons";

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
  bountyCount: number;
  savedCount: number;
  version: string;
  workspace: string;
  onOpenWorkspace: () => void;
}

export function Sidebar({
  view,
  onChange,
  bountyCount,
  savedCount,
  version,
  workspace,
  onOpenWorkspace,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark brand-logo">
          <img src={logoUrl} alt="" />
        </span>
        <span className="brand-text">
          <span className="brand-name">SHRIKE</span>
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

      <section className="local-card" aria-label="Local data status">
        <header className="local-card-head">
          <span className="pulse-dot" />
          <span className="micro-label">Local only</span>
        </header>
        <p>Bounties, views and notes live on this machine.</p>
        <button type="button" className="btn ghost tiny full" onClick={onOpenWorkspace}>
          <IconFolder size={14} />
          Open workspace
        </button>
      </section>

      <footer className="sidebar-foot">
        <span className="micro-label">v{version || "2.2.0"}</span>
        <span className="path-trunc" title={workspace}>
          {workspace}
        </span>
      </footer>
    </aside>
  );
}
