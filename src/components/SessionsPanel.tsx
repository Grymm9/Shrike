import { useState } from "react";
import type { Rules, SessionMeta } from "../lib/types";
import { formatRelative, plural } from "../lib/format";
import { rulesHash } from "../lib/engine";
import { IconPlus } from "./Icons";

interface SessionsPanelProps {
  sessions: SessionMeta[];
  activeId: string | null;
  rules: Rules;
  busy: string | null;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionsPanel({
  sessions,
  activeId,
  rules,
  busy,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: SessionsPanelProps) {
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const currentHash = rulesHash(rules);
  const disabled = Boolean(busy);

  function create() {
    onCreate(newName.trim() || "Untitled session");
    setNewName("");
  }

  return (
    <div className="sessions">
      <div className="sessions-head">
        <div>
          <span className="micro-label">Workspace</span>
          <h2>Engagements</h2>
          <p className="dim">
            One session per program engagement. Each file records the import, the rules snapshot
            and every endpoint.
          </p>
        </div>
        <div className="add-row flush">
          <input
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New session name"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
          />
          <button type="button" className="btn primary" onClick={create} disabled={disabled}>
            <IconPlus />
            Create
          </button>
        </div>
      </div>

      {!sessions.length ? (
        <div className="empty-state">
          <span className="micro-label">No sessions</span>
          <h2>Create your first engagement</h2>
          <p>
            Name it after the program, then import a recon list. Nothing is sent to a target —
            Shrike ranks what you already have.
          </p>
        </div>
      ) : (
        <div className="tablewrap sessions-table-wrap">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Session</th>
                <th className="num">Ingested</th>
                <th className="num">Ranked</th>
                <th className="num">Filtered</th>
                <th className="num">Peak</th>
                <th>Rules</th>
                <th>Updated</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((meta) => {
                const isActive = meta.id === activeId;
                const stale = meta.rulesHash !== currentHash;
                return (
                  <tr key={meta.id} className={isActive ? "active" : undefined}>
                    <td className="session-name-cell">
                      {renameId === meta.id ? (
                        <div className="inline-rename">
                          <input
                            className="input"
                            value={renameValue}
                            autoFocus
                            disabled={disabled}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                onRename(meta.id, renameValue);
                                setRenameId(null);
                              }
                              if (event.key === "Escape") setRenameId(null);
                            }}
                          />
                          <button
                            type="button"
                            className="btn tiny primary"
                            disabled={disabled}
                            onClick={() => {
                              onRename(meta.id, renameValue);
                              setRenameId(null);
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn tiny ghost"
                            onClick={() => setRenameId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="session-name">{meta.name}</span>
                          {isActive ? <span className="pill pill-active">active</span> : null}
                          <span className="session-sub mono">
                            {plural(meta.endpointCount, "endpoint")} ·{" "}
                            {formatRelative(meta.updatedAt)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num mono">{meta.endpointCount}</td>
                    <td className="num mono">{meta.keptCount}</td>
                    <td className="num mono dim">{meta.filteredCount}</td>
                    <td className="num mono">{meta.maxScore}</td>
                    <td>
                      {stale ? (
                        <span className="pill pill-warn" title={`Scored with ${meta.rulesHash}`}>
                          stale
                        </span>
                      ) : (
                        <span className="pill pill-ok">current</span>
                      )}
                    </td>
                    <td className="mono dim small">{formatRelative(meta.updatedAt)}</td>
                    <td className="col-actions">
                      {deleteId === meta.id ? (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn tiny danger"
                            disabled={disabled}
                            onClick={() => {
                              onDelete(meta.id);
                              setDeleteId(null);
                            }}
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            className="btn tiny ghost"
                            onClick={() => setDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn tiny"
                            disabled={disabled || isActive}
                            onClick={() => onOpen(meta.id)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="btn tiny ghost"
                            disabled={disabled}
                            onClick={() => {
                              setRenameId(meta.id);
                              setRenameValue(meta.name);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="btn tiny ghost"
                            disabled={disabled}
                            onClick={() => setDeleteId(meta.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
