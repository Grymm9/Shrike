import type { GitState } from "../lib/types";
import { IconArrowUp, IconPlus, IconSync } from "./Icons";

interface TopbarProps {
  title: string;
  sessionName: string | null;
  git: GitState | null;
  busy: string | null;
  canImport: boolean;
  onPull: () => void;
  onPush: () => void;
  onImport: () => void;
}

export function Topbar({
  title,
  sessionName,
  git,
  busy,
  canImport,
  onPull,
  onPush,
  onImport,
}: TopbarProps) {
  const pulling = busy === "pull";
  const pushing = busy === "push";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="view-title">{title}</h1>
        <span className="crumb-divider" />
        <span className="crumb-session" title={sessionName ?? undefined}>
          {sessionName ?? "no session"}
        </span>
      </div>

      <div className="topbar-right">
        {git ? (
          <span
            className={`sync-chip phase-${git.phase}`}
            title={`${git.message}${git.remote ? `\n${git.remote}` : ""}`}
          >
            <span className={`status-dot phase-${git.phase}`} />
            {git.phase === "working"
              ? git.action === "pull"
                ? "Pulling"
                : "Pushing"
              : git.phase === "idle"
                ? "Synced"
                : git.phase.replace("-", " ")}
          </span>
        ) : null}

        <button
          type="button"
          className={"btn" + (pulling ? " busy" : "")}
          onClick={onPull}
          disabled={Boolean(busy)}
          title="git pull origin main and reload sessions"
        >
          <span className={pulling ? "spin" : undefined}>
            <IconSync />
          </span>
          Sync / Fetch Latest
        </button>

        <button
          type="button"
          className="btn ghost"
          onClick={onPush}
          disabled={Boolean(busy) || !git?.remote}
          title={git?.remote ? "Commit and push sessions now" : "Add a remote first"}
        >
          <span className={pushing ? "spin" : undefined}>
            <IconArrowUp />
          </span>
          Push now
        </button>

        <button
          type="button"
          className="btn primary"
          onClick={onImport}
          disabled={!canImport || Boolean(busy)}
          title={canImport ? "Import a raw endpoint list" : "Create a session first"}
        >
          <IconPlus />
          Import endpoints
        </button>
      </div>
    </header>
  );
}
