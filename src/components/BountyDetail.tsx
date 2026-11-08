import { useEffect, useState } from "react";
import type { Bounty, ShortlistEntry, ShortlistStatus } from "../lib/types";
import {
  formatLaunched,
  formatMoney,
  formatPayout,
  formatResponse,
  formatStamp,
  formatType,
} from "../lib/format";
import { IconClose, IconExternal, IconStar } from "./Icons";

interface BountyDetailProps {
  bounty: Bounty;
  saved: ShortlistEntry | null;
  onClose: () => void;
  onOpen: (url: string) => void;
  onToggleSave: (bounty: Bounty) => void;
  onUpdateSaved: (
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ) => void;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function BountyDetail({
  bounty,
  saved,
  onClose,
  onOpen,
  onToggleSave,
  onUpdateSaved,
}: BountyDetailProps) {
  const [note, setNote] = useState(saved?.note ?? "");

  useEffect(() => {
    setNote(saved?.note ?? "");
  }, [bounty.id, saved?.note]);

  return (
    <aside className="detail bounty-detail">
      <header className="detail-head">
        <span className={`type-pill type-${bounty.type}`}>{formatType(bounty.type)}</span>
        <span className="detail-host mono" title={bounty.url}>
          @{bounty.handle}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          <IconClose />
        </button>
      </header>

      <div className="detail-body">
        <div className="detail-title">
          <h2>{bounty.name}</h2>
          <p>
            {bounty.type === "vdp"
              ? "Public vulnerability disclosure program on HackerOne."
              : bounty.type === "external"
                ? "External program listed through HackerOne."
                : "Public bug bounty program on HackerOne."}
          </p>
        </div>

        <dl className="detail-facts">
          <Fact
            label="Payout"
            value={formatPayout(bounty.minBounty, bounty.maxBounty, bounty.currency)}
          />
          <Fact
            label="Average"
            value={bounty.averageBounty != null ? formatMoney(bounty.averageBounty, bounty.currency) : "—"}
          />
          <Fact label="Reports" value={bounty.reports?.toLocaleString() ?? "—"} />
          <Fact label="Response" value={formatResponse(bounty.responseEfficiency)} />
          <Fact label="Launched" value={formatLaunched(bounty.launchedAt)} />
          <Fact label="Source" value={bounty.platform} />
        </dl>

        {bounty.tags.length ? (
          <div className="tag-row">
            {bounty.tags.map((tag) => (
              <span key={tag} className="signal">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <section className="detail-section">
          <span className="micro-label">Saved bounty</span>
          {saved ? (
            <>
              <label className="field">
                <span className="micro-label">Status</span>
                <select
                  className="select-input"
                  value={saved.status}
                  onChange={(event) =>
                    onUpdateSaved(bounty.id, {
                      status: event.target.value as ShortlistStatus,
                    })
                  }
                >
                  <option value="interested">Interested</option>
                  <option value="working">Working on it</option>
                  <option value="submitted">Submitted</option>
                </select>
              </label>

              <label className="field">
                <span className="micro-label">Notes</span>
                <textarea
                  className="input note-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={() => {
                    if (note !== (saved.note ?? "")) onUpdateSaved(bounty.id, { note });
                  }}
                  placeholder="Scope angles, contacts, next steps…"
                  rows={4}
                />
              </label>
              <p className="filter-help">
                Saved {formatStamp(saved.savedAt)} · notes save when you click away.
              </p>

              <button
                type="button"
                className="btn ghost"
                onClick={() => onToggleSave(bounty)}
              >
                <IconStar />
                Remove from saved
              </button>
            </>
          ) : (
            <>
              <p className="filter-help">
                Save this bounty to track it with a status and notes.
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={() => onToggleSave(bounty)}
              >
                <IconStar />
                Save to shortlist
              </button>
            </>
          )}
        </section>

        <section className="detail-section">
          <span className="micro-label">Open the source</span>
          <button type="button" className="btn" onClick={() => onOpen(bounty.url)}>
            <IconExternal />
            Open on HackerOne
          </button>
          <p className="filter-help mono detail-url">{bounty.url}</p>
        </section>
      </div>
    </aside>
  );
}
