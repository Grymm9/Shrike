import { useMemo, useState } from "react";
import type {
  Bounty,
  BountyCache,
  BountyFilters,
  RefreshProgress,
  SavedView,
  SavedViews,
  Shortlist,
  ShortlistStatus,
  SortKey,
} from "../lib/types";
import {
  activeFilterCount,
  applyBountyView,
  emptyFilters,
  filterLabels,
} from "../../electron/lib/bountyFilters.js";
import {
  formatLaunched,
  formatMoney,
  formatPayout,
  formatRelative,
  formatResponse,
  formatType,
  plural,
} from "../lib/format";
import {
  IconDownload,
  IconExternal,
  IconFilter,
  IconPrograms,
  IconSearch,
  IconStar,
  IconSync,
} from "./Icons";
import { FilterDrawer } from "./FilterDrawer";
import { BountyDetail } from "./BountyDetail";

interface BountiesViewProps {
  cache: BountyCache;
  filters: BountyFilters;
  sort: SortKey;
  views: SavedViews;
  activeViewId: string | null;
  shortlist: Shortlist;
  busy: string | null;
  progress: RefreshProgress | null;
  stale: boolean;
  onFilters: (filters: BountyFilters) => void;
  onSort: (sort: SortKey) => void;
  onApplyView: (view: SavedView | null) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onOpen: (url: string) => void;
  onToggleSave: (bounty: Bounty) => void;
  onUpdateSaved: (
    id: string,
    patch: { status?: ShortlistStatus; note?: string },
  ) => void;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "muted" | "warn";
}) {
  return (
    <div className="stat">
      <span className="micro-label">{label}</span>
      <span className={"stat-value" + (tone ? ` tone-${tone}` : "")}>{value}</span>
    </div>
  );
}

function clearFilter(filters: BountyFilters, key: string): BountyFilters {
  const next = { ...filters, types: [...filters.types] };
  if (key === "query") next.query = "";
  else if (key === "minBounty") next.minBounty = null;
  else if (key === "maxBounty") next.maxBounty = null;
  else if (key === "types") next.types = [];
  else if (key === "minReports") next.minReports = null;
  else if (key === "minResponseEfficiency") next.minResponseEfficiency = null;
  else if (key === "launchedAfter") next.launchedAfter = null;
  else if (key === "includeKeywords") next.includeKeywords = "";
  else if (key === "excludeKeywords") next.excludeKeywords = "";
  else if (key === "shortlistedOnly") next.shortlistedOnly = false;
  return next;
}

export function BountiesView({
  cache,
  filters,
  sort,
  views,
  activeViewId,
  shortlist,
  busy,
  progress,
  stale,
  onFilters,
  onSort,
  onApplyView,
  onSaveView,
  onDeleteView,
  onRefresh,
  onExport,
  onOpen,
  onToggleSave,
  onUpdateSaved,
}: BountiesViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const savedIds = useMemo(() => new Set(Object.keys(shortlist.items)), [shortlist]);
  const rows = useMemo(
    () => applyBountyView(cache.programs, filters, sort, savedIds),
    [cache.programs, filters, sort, savedIds],
  );

  const filterCount = activeFilterCount(filters);
  const labels = filterLabels(filters);
  const refreshing = busy === "refresh";
  const selected = selectedId
    ? (cache.programs.find((bounty) => bounty.id === selectedId) ?? null)
    : null;

  const topPayout = rows.reduce(
    (max, bounty) => Math.max(max, bounty.maxBounty ?? bounty.minBounty ?? 0),
    0,
  );

  if (!cache.programs.length) {
    return (
      <div className="bounties">
        <div className="start">
          <div className="start-copy">
            <span className="micro-label">HackerOne directory</span>
            <h2>Read the bounty board once</h2>
            <p>
              Shrike loads every public bounty and VDP on HackerOne, then lets you filter them
              locally by payout, type, reports, response efficiency and launch date. The list is
              cached, so the next launch is instant.
            </p>
            <div className="start-actions">
              <button
                type="button"
                className="btn primary"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <span className={refreshing ? "spin" : undefined}>
                  <IconSync />
                </span>
                {refreshing ? "Reading HackerOne…" : "Read HackerOne directory"}
              </button>
            </div>
            <p className="start-note">
              About 18 requests, one page at a time. Cached in{" "}
              <code>config/bounties.json</code>; refresh whenever you want.
            </p>
          </div>

          <div className="format-card">
            <span className="micro-label">What gets loaded</span>
            <pre>{`Paying bounty programs
Vulnerability disclosure programs
External programs
Payout ranges · reports · response rate`}</pre>
            <p>
              HackerOne remains the source. Shrike only reads its public directory; it never
              contacts the companies themselves.
            </p>
          </div>
        </div>

        {progress ? (
          <div className="progress progress-empty">
            <span className="micro-label">
              {progress.phase === "vdp" ? "Reading VDPs" : "Reading bounties"} ·{" "}
              {progress.total ? `${progress.loaded} of ${progress.total}` : "starting…"}
            </span>
            <span className="progress-track">
              <i
                style={{
                  width: progress.total
                    ? `${Math.min(100, (progress.loaded / progress.total) * 100)}%`
                    : "0%",
                }}
              />
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bounties">
      <div className="stats">
        <Stat label="Scanned" value={cache.scanned} />
        <Stat label="Showing" value={rows.length} />
        <Stat label="Top payout" value={topPayout ? formatMoney(topPayout, "USD") : "—"} tone="warn" />
        <Stat label="Updated" value={formatRelative(cache.fetchedAt)} tone="muted" />
      </div>

      <div className="toolbar">
        <div className="search">
          <IconSearch size={14} />
          <input
            value={filters.query}
            onChange={(event) => onFilters({ ...filters, query: event.target.value })}
            placeholder="Search name, handle or tag"
            spellCheck={false}
            aria-label="Search bounties"
          />
        </div>

        <button
          type="button"
          className={"btn" + (filterCount ? " primary" : " ghost")}
          onClick={() => setShowFilters(true)}
          title="Open bounty filters"
        >
          <IconFilter />
          Filters
          {filterCount ? <span className="filter-count">{filterCount}</span> : null}
        </button>

        <div className="toolbar-right">
          <label className="inline-field">
            <span className="micro-label">View</span>
            <select
              className="select-input view-select"
              value={activeViewId ?? ""}
              onChange={(event) => {
                const view = views.views.find((item) => item.id === event.target.value) ?? null;
                onApplyView(view);
              }}
              aria-label="Saved view"
            >
              <option value="">Custom filters</option>
              {views.views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-field">
            <span className="micro-label">Sort</span>
            <select
              className="select-input"
              value={sort}
              onChange={(event) => onSort(event.target.value as SortKey)}
              aria-label="Sort bounties"
            >
              <option value="maxBounty">Top payout</option>
              <option value="minBounty">Entry payout</option>
              <option value="reports">Reports</option>
              <option value="responseEfficiency">Response</option>
              <option value="launched">Newest</option>
              <option value="name">Name</option>
            </select>
          </label>

          <button
            type="button"
            className="btn ghost"
            onClick={onExport}
            disabled={Boolean(busy) || !rows.length}
            title="Export the current view as CSV"
          >
            <IconDownload />
            CSV
          </button>

          {stale ? (
            <span className="pill pill-warn" title="The cached directory is older than your cache-age setting">
              Stale
            </span>
          ) : null}

          <button
            type="button"
            className="btn"
            onClick={onRefresh}
            disabled={Boolean(busy)}
            title="Read the HackerOne directory again"
          >
            <span className={refreshing ? "spin" : undefined}>
              <IconSync />
            </span>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {progress ? (
        <div className="progress">
          <span className="micro-label">
            {progress.phase === "vdp" ? "Reading VDPs" : "Reading bounties"} ·{" "}
            {progress.total ? `${progress.loaded} of ${progress.total}` : "starting…"}
          </span>
          <span className="progress-track">
            <i
              style={{
                width: progress.total
                  ? `${Math.min(100, (progress.loaded / progress.total) * 100)}%`
                  : "0%",
              }}
            />
          </span>
        </div>
      ) : null}

      {labels.length ? (
        <div className="active-filters">
          {labels.map((label) => (
            <button
              key={label.key}
              type="button"
              className="filter-chip"
              onClick={() => onFilters(clearFilter(filters, label.key))}
              title="Remove this filter"
            >
              {label.text}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            type="button"
            className="filter-clear"
            onClick={() => onFilters(emptyFilters())}
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div className={"split" + (selected ? " with-detail" : "")}>
        <div className="tablewrap">
          <table className="endpoints bounty-table">
            <thead>
              <tr>
                <th className="col-star" aria-label="Saved" />
                <th>Bounty</th>
                <th className="col-payout">Payout</th>
                <th className="col-type">Type</th>
                <th className="col-reports">Reports</th>
                <th className="col-response">Response</th>
                <th className="col-started">Started</th>
                <th className="col-open" aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {rows.map((bounty) => {
                const saved = Boolean(shortlist.items[bounty.id]);
                return (
                  <tr
                    key={bounty.id}
                    className={"row" + (selectedId === bounty.id ? " selected" : "")}
                    onClick={() => setSelectedId(bounty.id)}
                  >
                    <td className="col-star">
                      <button
                        type="button"
                        className={"star-btn" + (saved ? " on" : "")}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleSave(bounty);
                        }}
                        aria-label={
                          saved ? `Remove ${bounty.name} from saved` : `Save ${bounty.name}`
                        }
                      >
                        <IconStar size={14} />
                      </button>
                    </td>
                    <td className="col-bounty">
                      <span className="bounty-name">{bounty.name}</span>
                      <span className="bounty-handle mono">@{bounty.handle}</span>
                    </td>
                    <td className="col-payout mono">
                      {formatPayout(bounty.minBounty, bounty.maxBounty, bounty.currency)}
                    </td>
                    <td className="col-type">
                      <span className={`type-pill type-${bounty.type}`}>
                        {formatType(bounty.type)}
                      </span>
                    </td>
                    <td className="col-reports mono dim">
                      {bounty.reports != null ? bounty.reports.toLocaleString() : "—"}
                    </td>
                    <td className="col-response mono">
                      {formatResponse(bounty.responseEfficiency)}
                    </td>
                    <td className="col-started mono dim">{formatLaunched(bounty.launchedAt)}</td>
                    <td className="col-open">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(bounty.url);
                        }}
                        aria-label={`Open ${bounty.name} on HackerOne`}
                      >
                        <IconExternal size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!rows.length ? (
            <div className="empty-inline">
              <span className="micro-label">No matches</span>
              <p className="empty-title">No bounties fit these filters.</p>
              <p>
                {filterCount
                  ? "Relax a filter or clear the search to see the rest of the directory."
                  : "The directory has not loaded any bounties yet."}
              </p>
              <div className="start-actions">
                {filterCount ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onFilters(emptyFilters())}
                  >
                    Clear all filters
                  </button>
                ) : (
                  <button type="button" className="btn primary" onClick={onRefresh}>
                    <IconPrograms />
                    Read HackerOne directory
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {selected ? (
          <BountyDetail
            bounty={selected}
            saved={shortlist.items[selected.id] ?? null}
            onClose={() => setSelectedId(null)}
            onOpen={onOpen}
            onToggleSave={onToggleSave}
            onUpdateSaved={onUpdateSaved}
          />
        ) : null}
      </div>

      <div className="bounties-foot">
        <span className="dim">
          {plural(rows.length, "bounty", "bounties")} of {cache.scanned} scanned
          {filterCount ? ` · ${plural(filterCount, "filter")} active` : ""}
        </span>
        <span className="dim">
          {cache.fetchedAt ? `Last read ${formatRelative(cache.fetchedAt)}` : "Never read"}
        </span>
      </div>

      {showFilters ? (
        <FilterDrawer
          filters={filters}
          views={views}
          activeViewId={activeViewId}
          resultCount={rows.length}
          onFilters={onFilters}
          onApplyView={onApplyView}
          onSaveView={onSaveView}
          onDeleteView={onDeleteView}
          onClose={() => setShowFilters(false)}
        />
      ) : null}
    </div>
  );
}
