import type { UpdateState } from "../lib/types";
import { IconDownload } from "./Icons";

interface TopbarProps {
  title: string;
  update: UpdateState;
  onOpenUpdates: () => void;
}

function updateLabel(update: UpdateState): string {
  if (update.status === "downloaded") return "Restart to update";
  if (update.status === "downloading") return `Updating ${Math.round(update.percent)}%`;
  return update.version ? `Update ${update.version}` : "Update available";
}

export function Topbar({ title, update, onOpenUpdates }: TopbarProps) {
  const showUpdate =
    update.status === "available" ||
    update.status === "downloaded" ||
    update.status === "downloading";

  return (
    <header className="topbar">
      <h1 className="view-title">{title}</h1>

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
    </header>
  );
}
