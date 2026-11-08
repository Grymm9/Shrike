import { useMemo, useState } from "react";
import type {
  Bounty,
  BountyCache,
  BountyFilters,
  BountySource,
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
  IconSearch,
  IconStar,
  IconSync,
} from "./Icons";
import { FilterDrawer } from "./FilterDrawer";
import { BountyDetail } from "./BountyDetail";

interface BountiesViewProps {
  cache: BountyCache;
  source: BountySource;
  sources: Array<{ id: BountySource; label: string }>;
  filters: BountyFilters;
  sort: SortKey;
  views: SavedViews;
  activeViewId: string | null;
  shortlist: Shortlist;
  busy: string | null;
  progress: RefreshProgress | null;
  stale: boolean;
  onSourceChange: (source: BountySource) => void;
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

function responseClass(value: number | null): string {
  if (value == null) return "resp-none";
  if (value >= 90) return "resp-high";
  if (value >= 50) return "resp-mid";
  return "resp-low";
}

function isHighPayout(bounty: Bounty): boolean {
  return (bounty.maxBounty ?? bounty.minBounty ?? 0) >= 100_000;
}

export function BountiesView({
  cache,
  source,
  sources,
  filters,
  sort,
  views,
  activeViewId,
  shortlist,
  busy,
  progress,
  stale,
  onSourceChange,
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
  const sourceLabel = sources.find((item) => item.id === source)?.label ?? "Source";
  const selected = selectedId
    ? (cache.programs.find((bounty) => bounty.id === selectedId) ?? null)
    : null;

  const topBounty = rows.reduce<Bounty | null>((best, bounty) => {
    const value = bounty.maxBounty ?? bounty.minBounty ?? 0;
    const bestValue = best ? (best.maxBounty ?? best.minBounty ?? 0) : -1;
    return value > bestValue ? bounty : best;
  }, null);
  const topPayout = topBounty ? (topBounty.maxBounty ?? topBounty.minBounty ?? 0) : 0;
  const topCurrency = topBounty?.currency ?? "USD";
  const hasReports = cache.programs.some((bounty) => bounty.reports != null);
  const hasResponse = cache.programs.some(
    (bounty) => bounty.responseEfficiency != null,
  );
  const hasStarted = cache.programs.some((bounty) => Boolean(bounty.launchedAt));

  if (!cache.programs.length) {
    return (
      <div className="bounties bounties-empty">
        <div className="empty-board">
          <span className="micro-label">{sourceLabel}</span>
          <h2>Read the {sourceLabel} board</h2>
          <p>Load public programs once, then filter locally. Cached between launches.</p>
          <button
            type="button"
            className="btn primary"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <span className={refreshing ? "spin" : undefined}>
              <IconSync />
            </span>
            {refreshing ? "Reading…" : `Read ${sourceLabel}`}
          </button>
        </div>

        {progress ? (
          <div className="progress progress-empty">
            <span className="micro-label">
              {progress.loaded} of {progress.total || "…"}
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
        <div className="stat">
          <span className="micro-label">Scanned</span>
          <span className="stat-value">{cache.scanned}</span>
        </div>
        <div className="stat">
          <span className="micro-label">Showing</span>
          <span className="stat-value">{rows.length}</span>
        </div>
        <div className="stat">
          <span className="micro-label">Top payout</span>
          <span className="stat-value tone-high">
            {topPayout ? formatMoney(topPayout, topCurrency) : "—"}
          </span>
        </div>
        <div className="stat">
          <span className="micro-label">Updated</span>
          <span className="stat-value tone-muted">{formatRelative(cache.fetchedAt)}</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <IconSearch size={14} />
          <input
            value={filters.query}
            onChange={(event) => onFilters({ ...filters, query: event.target.value })}
            placeholder="Search bounties"
            spellCheck={false}
            aria-label="Search bounties"
          />
        </div>

        <div className="toolbar-right">
          <label className="inline-field">
            <span className="micro-label">Source</span>
            <select
              className="select-input source-select"
              value={source}
              onChange={(event) => onSourceChange(event.target.value as BountySource)}
              disabled={Boolean(busy)}
              aria-label="Bounty source"
            >
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

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
              <option value="">Custom</option>
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

          <button type="button" className="btn action-btn" onClick={() => setShowFilters(true)}>
            <IconFilter />
            Filters
            {filterCount ? <span className="filter-count">{filterCount}</span> : null}
          </button>
          <button
            type="button"
            className="btn action-btn"
            onClick={onExport}
            disabled={Boolean(busy) || !rows.length}
          >
            <IconDownload />
            CSV
          </button>
          <button
            type="button"
            className="btn action-btn"
            onClick={onRefresh}
            disabled={Boolean(busy)}
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
            {progress.loaded} of {progress.total || "…"}
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
              onClick={() => {
                const next = { ...filters, types: [...filters.types] };
                if (label.key === "query") next.query = "";
                else if (label.key === "minBounty") next.minBounty = null;
                else if (label.key === "maxBounty") next.maxBounty = null;
                else if (label.key === "types") next.types = [];
                else if (label.key === "minReports") next.minReports = null;
                else if (label.key === "minResponseEfficiency")
                  next.minResponseEfficiency = null;
                else if (label.key === "launchedAfter") next.launchedAfter = null;
                else if (label.key === "includeKeywords") next.includeKeywords = "";
                else if (label.key === "excludeKeywords") next.excludeKeywords = "";
                else if (label.key === "shortlistedOnly") next.shortlistedOnly = false;
                onFilters(next);
              }}
              title="Remove this filter"
            >
              {label.text}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="filter-clear" onClick={() => onFilters(emptyFilters())}>
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
                {hasReports ? <th className="col-reports">Reports</th> : null}
                {hasResponse ? <th className="col-response">Response</th> : null}
                {hasStarted ? <th className="col-started">Started</th> : null}
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
                      <span className="bounty-cell">
                        <span className="bounty-name">{bounty.name}</span>
                        <span className="bounty-handle mono">@{bounty.handle}</span>
                      </span>
                    </td>
                    <td className={"col-payout mono" + (isHighPayout(bounty) ? " payout-high" : "")}>
                      {formatPayout(bounty.minBounty, bounty.maxBounty, bounty.currency)}
                    </td>
                    <td className="col-type">
                      <span className={`type-pill type-${bounty.type}`}>
                        {formatType(bounty.type)}
                      </span>
                    </td>
                    {hasReports ? (
                      <td className="col-reports mono">
                        {bounty.reports != null ? bounty.reports.toLocaleString() : "—"}
                      </td>
                    ) : null}
                    {hasResponse ? (
                      <td
                        className={
                          "col-response mono " + responseClass(bounty.responseEfficiency)
                        }
                      >
                        {formatResponse(bounty.responseEfficiency)}
                      </td>
                    ) : null}
                    {hasStarted ? (
                      <td className="col-started mono">{formatLaunched(bounty.launchedAt)}</td>
                    ) : null}
                    <td className="col-open">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(bounty.url);
                        }}
                        aria-label={`Open ${bounty.name} on ${bounty.platform}`}
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
              <p>Clear a filter or lower the payout floor to see more.</p>
              <button type="button" className="btn ghost" onClick={() => onFilters(emptyFilters())}>
                Clear all filters
              </button>
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
          {stale ? "Stale cache · " : ""}
          {cache.fetchedAt ? `read ${formatRelative(cache.fetchedAt)}` : "never read"}
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
