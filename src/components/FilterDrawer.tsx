import { useState } from "react";
import type { BountyFilters, BountyType, SavedView, SavedViews } from "../lib/types";
import { emptyFilters } from "../../electron/lib/bountyFilters.js";
import { plural } from "../lib/format";
import { IconClose } from "./Icons";

interface FilterDrawerProps {
  filters: BountyFilters;
  views: SavedViews;
  activeViewId: string | null;
  resultCount: number;
  onFilters: (filters: BountyFilters) => void;
  onApplyView: (view: SavedView | null) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onClose: () => void;
}

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const TYPES: Array<{ value: BountyType; label: string; hint: string }> = [
  { value: "bounty", label: "Bounty", hint: "Pays cash rewards" },
  { value: "vdp", label: "VDP", hint: "Disclosure policy, usually no payout" },
  { value: "external", label: "External", hint: "Listed on HackerOne, hosted elsewhere" },
];

export function FilterDrawer({
  filters,
  views,
  activeViewId,
  resultCount,
  onFilters,
  onApplyView,
  onSaveView,
  onDeleteView,
  onClose,
}: FilterDrawerProps) {
  const [name, setName] = useState("");

  function toggleType(type: BountyType) {
    const next = filters.types.includes(type)
      ? filters.types.filter((item) => item !== type)
      : [...filters.types, type];
    onFilters({ ...filters, types: next });
  }

  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <aside className="drawer filter-drawer" role="dialog" aria-modal="true" aria-label="Bounty filters">
        <header className="drawer-head">
          <div>
            <span className="micro-label">Bounty filters</span>
            <h2>Filter the board</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close filters">
            <IconClose />
          </button>
        </header>

        <div className="drawer-body">
          <section className="drawer-section">
            <span className="micro-label">Saved views</span>
            <div className="view-list">
              {views.views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={"view-item" + (activeViewId === view.id ? " active" : "")}
                  onClick={() => onApplyView(view)}
                >
                  <span>{view.name}</span>
                  {activeViewId === view.id ? <em>active</em> : null}
                </button>
              ))}
              {!views.views.length ? (
                <p className="filter-help">No saved views yet. Set some filters and save them.</p>
              ) : null}
            </div>

            <div className="add-row save-view">
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this view"
                maxLength={80}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && name.trim()) {
                    onSaveView(name.trim());
                    setName("");
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={!name.trim()}
                onClick={() => {
                  onSaveView(name.trim());
                  setName("");
                }}
              >
                Save current
              </button>
            </div>
            {activeViewId ? (
              <button
                type="button"
                className="btn danger tiny"
                onClick={() => onDeleteView(activeViewId)}
              >
                Delete active view
              </button>
            ) : null}
          </section>

          <section className="drawer-section">
            <span className="micro-label">Payout</span>
            <p className="filter-help">Compared with the program&apos;s top payout.</p>
            <div className="filter-grid">
              <label className="field">
                <span className="micro-label">At least</span>
                <span className="money-input">
                  <span>$</span>
                  <input
                    className="num-input wide"
                    value={filters.minBounty ?? ""}
                    onChange={(event) =>
                      onFilters({ ...filters, minBounty: numberValue(event.target.value) })
                    }
                    placeholder="0"
                    inputMode="numeric"
                    aria-label="Minimum top payout"
                  />
                </span>
              </label>
              <label className="field">
                <span className="micro-label">At most</span>
                <span className="money-input">
                  <span>$</span>
                  <input
                    className="num-input wide"
                    value={filters.maxBounty ?? ""}
                    onChange={(event) =>
                      onFilters({ ...filters, maxBounty: numberValue(event.target.value) })
                    }
                    placeholder="Any"
                    inputMode="numeric"
                    aria-label="Maximum top payout"
                  />
                </span>
              </label>
            </div>
          </section>

          <section className="drawer-section">
            <span className="micro-label">Program type</span>
            <div className="check-list">
              {TYPES.map((type) => (
                <label key={type.value} className="check-row">
                  <input
                    type="checkbox"
                    checked={filters.types.includes(type.value)}
                    onChange={() => toggleType(type.value)}
                  />
                  <span>
                    <strong>{type.label}</strong>
                    <em>{type.hint}</em>
                  </span>
                </label>
              ))}
            </div>
            <p className="filter-help">Leave all unchecked to include every type.</p>
          </section>

          <section className="drawer-section">
            <span className="micro-label">Activity</span>
            <div className="filter-grid">
              <label className="field">
                <span className="micro-label">Reports at least</span>
                <input
                  className="num-input wide"
                  value={filters.minReports ?? ""}
                  onChange={(event) =>
                    onFilters({ ...filters, minReports: numberValue(event.target.value) })
                  }
                  placeholder="0"
                  inputMode="numeric"
                  aria-label="Minimum resolved reports"
                />
              </label>
              <label className="field">
                <span className="micro-label">Response at least</span>
                <span className="money-input">
                  <input
                    className="num-input wide"
                    value={filters.minResponseEfficiency ?? ""}
                    onChange={(event) => {
                      const value = numberValue(event.target.value);
                      onFilters({
                        ...filters,
                        minResponseEfficiency: value == null ? null : Math.min(100, value),
                      });
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label="Minimum response efficiency percentage"
                  />
                  <span>%</span>
                </span>
              </label>
            </div>
          </section>

          <section className="drawer-section">
            <span className="micro-label">Launched</span>
            <label className="field">
              <span className="micro-label">After year</span>
              <input
                className="num-input wide"
                value={filters.launchedAfter ?? ""}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                  onFilters({ ...filters, launchedAfter: value || null });
                }}
                placeholder="e.g. 2024"
                inputMode="numeric"
                aria-label="Launched after year"
              />
            </label>
          </section>

          <section className="drawer-section">
            <span className="micro-label">Keywords</span>
            <div className="filter-grid">
              <label className="field">
                <span className="micro-label">Must include</span>
                <input
                  className="input"
                  value={filters.includeKeywords}
                  onChange={(event) =>
                    onFilters({ ...filters, includeKeywords: event.target.value })
                  }
                  placeholder="payments, cloud"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span className="micro-label">Must exclude</span>
                <input
                  className="input"
                  value={filters.excludeKeywords}
                  onChange={(event) =>
                    onFilters({ ...filters, excludeKeywords: event.target.value })
                  }
                  placeholder="crypto, adult"
                  spellCheck={false}
                />
              </label>
            </div>
            <p className="filter-help">Comma or space separated. Matches name, handle and tags.</p>
          </section>

          <section className="drawer-section">
            <label className="check-row">
              <input
                type="checkbox"
                checked={filters.shortlistedOnly}
                onChange={(event) =>
                  onFilters({ ...filters, shortlistedOnly: event.target.checked })
                }
              />
              <span>
                <strong>Shortlisted only</strong>
                <em>Show only bounties you have saved.</em>
              </span>
            </label>
          </section>
        </div>

        <footer className="drawer-foot">
          <button type="button" className="btn ghost" onClick={() => onFilters(emptyFilters())}>
            Reset filters
          </button>
          <span className="dim">{plural(resultCount, "match", "matches")}</span>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </>
  );
}
