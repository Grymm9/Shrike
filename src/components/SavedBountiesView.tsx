import { useEffect, useState } from "react";
import type {
  Bounty,
  BountyCache,
  Shortlist,
  ShortlistEntry,
  ShortlistStatus,
} from "../lib/types";
import { formatPayout, formatType, plural } from "../lib/format";
import { IconExternal, IconPrograms, IconStar, IconTrash } from "./Icons";

interface SavedBountiesViewProps {
  cache: BountyCache;
  shortlist: Shortlist;
  onOpen: (url: string) => void;
  onUpdateSaved: (
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ) => void;
  onRemove: (id: string) => void;
  onBrowse: () => void;
}

function SavedRow({
  bounty,
  entry,
  onOpen,
  onUpdateSaved,
  onRemove,
}: {
  bounty: Bounty | null;
  entry: ShortlistEntry;
  onOpen: (url: string) => void;
  onUpdateSaved: (
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [note, setNote] = useState(entry.note);

  useEffect(() => {
    setNote(entry.note);
  }, [entry.note]);

  return (
    <tr className="row saved-row">
      <td className="col-saved-star">
        <span className="star-btn on" aria-hidden="true">
          <IconStar size={14} />
        </span>
      </td>
      <td className="col-bounty">
        {bounty ? (
          <>
            <span className="bounty-name">{bounty.name}</span>
            <span className="bounty-handle mono">@{bounty.handle}</span>
          </>
        ) : (
          <>
            <span className="bounty-name">Missing from the current list</span>
            <span className="bounty-handle mono">{entry.id}</span>
          </>
        )}
      </td>
      <td className="col-payout mono">
        {bounty
          ? formatPayout(bounty.minBounty, bounty.maxBounty, bounty.currency)
          : "—"}
      </td>
      <td className="col-type">
        {bounty ? (
          <span className={`type-pill type-${bounty.type}`}>{formatType(bounty.type)}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="col-status">
        <select
          className="select-input"
          value={entry.status}
          onChange={(event) =>
            onUpdateSaved(entry.id, {
              status: event.target.value as ShortlistStatus,
            })
          }
          aria-label="Saved status"
        >
          <option value="interested">Interested</option>
          <option value="working">Working on it</option>
          <option value="submitted">Submitted</option>
        </select>
      </td>
      <td className="col-note">
        <input
          className="input note-field"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note !== entry.note) onUpdateSaved(entry.id, { note });
          }}
          placeholder="Notes…"
          maxLength={4000}
        />
      </td>
      <td className="col-open">
        {bounty ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => onOpen(bounty.url)}
            aria-label={`Open ${bounty.name} on HackerOne`}
          >
            <IconExternal size={14} />
          </button>
        ) : null}
      </td>
      <td className="col-remove">
        <button
          type="button"
          className="icon-btn danger-icon"
          onClick={() => onRemove(entry.id)}
          aria-label="Remove from saved"
        >
          <IconTrash size={14} />
        </button>
      </td>
    </tr>
  );
}

export function SavedBountiesView({
  cache,
  shortlist,
  onOpen,
  onUpdateSaved,
  onRemove,
  onBrowse,
}: SavedBountiesViewProps) {
  const entries = Object.values(shortlist.items).sort((a, b) =>
    a.savedAt < b.savedAt ? 1 : -1,
  );
  const byId = new Map(cache.programs.map((bounty) => [bounty.id, bounty]));

  if (!entries.length) {
    return (
      <div className="start">
        <div className="start-copy">
          <span className="micro-label">Shortlist</span>
          <h2>No saved bounties yet</h2>
          <p>
            Star a bounty while browsing to keep it here. You can track a status and notes, and
            those stay local until you push them with Git.
          </p>
          <div className="start-actions">
            <button type="button" className="btn primary" onClick={onBrowse}>
              <IconPrograms />
              Browse bounties
            </button>
          </div>
        </div>
        <div className="format-card">
          <span className="micro-label">Statuses</span>
          <pre>{`Interested
Working on it
Submitted`}</pre>
          <p>Notes save when you click away. Everything is stored in config/shortlist.json.</p>
        </div>
      </div>
    );
  }

  const counts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="saved">
      <div className="stats">
        <div className="stat">
          <span className="micro-label">Saved</span>
          <span className="stat-value">{entries.length}</span>
        </div>
        <div className="stat">
          <span className="micro-label">Interested</span>
          <span className="stat-value tone-muted">{counts.interested ?? 0}</span>
        </div>
        <div className="stat">
          <span className="micro-label">Working</span>
          <span className="stat-value tone-warn">{counts.working ?? 0}</span>
        </div>
        <div className="stat">
          <span className="micro-label">Submitted</span>
          <span className="stat-value">{counts.submitted ?? 0}</span>
        </div>
      </div>

      <div className="toolbar saved-toolbar">
        <span className="micro-label">
          {plural(entries.length, "saved bounty", "saved bounties")}
        </span>
        <div className="toolbar-right">
          <button type="button" className="btn ghost" onClick={onBrowse}>
            <IconPrograms />
            Browse bounties
          </button>
        </div>
      </div>

      <div className="tablewrap">
        <table className="endpoints saved-table">
          <thead>
            <tr>
              <th className="col-saved-star" aria-label="Saved" />
              <th>Bounty</th>
              <th className="col-payout">Payout</th>
              <th className="col-type">Type</th>
              <th className="col-status">Status</th>
              <th className="col-note">Notes</th>
              <th className="col-open" aria-label="Open" />
              <th className="col-remove" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <SavedRow
                key={entry.id}
                bounty={byId.get(entry.id) ?? null}
                entry={entry}
                onOpen={onOpen}
                onUpdateSaved={onUpdateSaved}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
