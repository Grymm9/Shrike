import type { GitState, UpdateState } from "../lib/types";
import { IconDownload } from "./Icons";

interface TopbarProps {
  title: string;
  crumb: string;
  git: GitState | null;
  update: UpdateState;
  onOpenUpdates: () => void;
}

function syncLabel(git: GitState): string {
  if (!git.remote) return git.phase === "working" ? "Saving" : "Local only";
  if (git.phase === "working") return git.action === "pull" ? "Fetching" : "Pushing";
  if (git.phase === "idle") return "Synced";
  if (git.phase === "behind") return "Pull needed";
  if (git.phase === "offline") return "Offline";
  if (git.phase === "error") return "Sync error";
  return git.phase;
}

function updateLabel(update: UpdateState): string {
  if (update.status === "downloaded") return "Restart to update";
  if (update.status === "downloading") return `Updating ${Math.round(update.percent)}%`;
  return update.version ? `Update ${update.version}` : "Update available";
}

export function Topbar({ title, crumb, git, update, onOpenUpdates }: TopbarProps) {
  const showUpdate =
    update.status === "available" ||
    update.status === "downloaded" ||
    update.status === "downloading";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="view-title">{title}</h1>
        <span className="crumb-divider" />
        <span className="crumb-session" title={crumb}>
          {crumb}
        </span>
      </div>

      <div className="topbar-right">
        {showUpdate ? (
          <button
            type="button"
            className="btn update-top"
            onClick={onOpenUpdates}
            title={update.message}
          >
            <IconDownload />
            {updateLabel(update)}
          </button>
        ) : null}

        {git ? (
          <span
            className={`sync-chip phase-${git.phase}`}
            title={`${git.message}${git.remote ? `\n${git.remote}` : ""}`}
          >
            <span className={`status-dot phase-${git.phase}`} />
            {syncLabel(git)}
          </span>
        ) : null}
      </div>
    </header>
  );
}
