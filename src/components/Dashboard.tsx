import { useEffect, useMemo, useState } from "react";
import type { Endpoint, Session } from "../lib/types";
import { scoreLabel } from "../lib/format";
import { IconPlus, IconSearch } from "./Icons";
import { EndpointDetail } from "./EndpointDetail";

type Mode = "ranked" | "filtered" | "all";
type SortKey = "score" | "path" | "depth";

interface DashboardProps {
  session: Session | null;
  busy: string | null;
  onImport: () => void;
  onRescore: () => void;
  onCreate: () => void;
}

function signalsOf(endpoint: Endpoint): string[] {
  const out: string[] = [];
  for (const reason of endpoint.reasons) {
    if (reason.code === "numeric_id") out.push("num-id");
    else if (reason.code === "uuid") out.push("uuid");
    else if (reason.code === "keyword") out.push(reason.label);
    else if (reason.code === "sensitive_param") out.push("param");
    else if (reason.code === "query") out.push("query");
    else if (reason.code === "depth") out.push("deep");
  }
  return [...new Set(out)].slice(0, 4);
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

export function Dashboard({ session, busy, onImport, onRescore, onCreate }: DashboardProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("ranked");
  const [minScore, setMinScore] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [session?.id]);

  const maxScore = Math.max(1, session?.stats.maxScore ?? 1);

  const rows = useMemo(() => {
    if (!session) return [];
    let list = session.endpoints;
    if (mode === "ranked") list = list.filter((e) => e.kept);
    else if (mode === "filtered") list = list.filter((e) => !e.kept);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.url.toLowerCase().includes(q) ||
          e.template.toLowerCase().includes(q) ||
          e.host.toLowerCase().includes(q) ||
          e.reasons.some((r) => r.label.includes(q)),
      );
    }

    const floor = Number(minScore);
    if (minScore.trim() && Number.isFinite(floor) && floor > 0 && mode !== "filtered") {
      list = list.filter((e) => e.score >= floor);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (a.kept !== b.kept) return a.kept ? -1 : 1;
      if (sort === "path") return a.path.localeCompare(b.path);
      if (sort === "depth") return b.depth - a.depth || b.score - a.score;
      return b.score - a.score || a.path.localeCompare(b.path);
    });
    return sorted;
  }, [session, mode, query, minScore, sort]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (!rows.length) return;
      event.preventDefault();
      setSelectedId((current) => {
        const index = rows.findIndex((row) => row.id === current);
        const next =
          event.key === "ArrowDown"
            ? Math.min(rows.length - 1, index + 1)
            : Math.max(0, index < 0 ? 0 : index - 1);
        return rows[next]?.id ?? null;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows]);

  const selected = session?.endpoints.find((e) => e.id === selectedId) ?? null;
  const stats = session?.stats;

  if (!session) {
    return (
      <div className="dash">
        <div className="empty-state tall">
          <span className="micro-label">No active session</span>
          <h2>Start with a session</h2>
          <p>
            A session holds one program engagement: the raw recon list, the rules that scored it,
            and every filtered endpoint. Sessions are written to <code>/sessions</code> and pushed
            to your remote.
          </p>
          <button type="button" className="btn primary" onClick={onCreate}>
            <IconPlus />
            Create session
          </button>
        </div>
      </div>
    );
  }

  if (!session.endpoints.length) {
    return (
      <div className="dash">
        <div className="stats">
          <Stat label="Ingested" value={0} />
          <Stat label="Filtered" value={0} />
          <Stat label="Ranked" value={0} />
          <Stat label="Peak score" value={0} />
        </div>
        <div className="empty-state tall">
          <span className="micro-label">{session.name}</span>
          <h2>No endpoints loaded</h2>
          <p>
            Paste a raw endpoint list or drop a recon file. Lines may be full URLs, host/path, or
            path only, with an optional <code>METHOD</code> prefix.
          </p>
          <button type="button" className="btn primary" onClick={onImport}>
            <IconPlus />
            Import endpoints
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="stats">
        <Stat label="Ingested" value={stats?.ingested ?? 0} />
        <Stat label="Filtered" value={stats?.filtered ?? 0} tone="muted" />
        <Stat label="Ranked" value={stats?.kept ?? 0} />
        <Stat label="Peak score" value={stats?.maxScore ?? 0} tone="warn" />
      </div>

      <div className="toolbar">
        <div className="search">
          <IconSearch size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by path, host or signal"
            spellCheck={false}
            aria-label="Filter endpoints"
          />
        </div>

        <div className="segmented" role="group" aria-label="Endpoint view">
          <button
            type="button"
            className={mode === "ranked" ? "active" : ""}
            onClick={() => setMode("ranked")}
          >
            Ranked <span>{stats?.kept ?? 0}</span>
          </button>
          <button
            type="button"
            className={mode === "filtered" ? "active" : ""}
            onClick={() => setMode("filtered")}
          >
            Filtered <span>{stats?.filtered ?? 0}</span>
          </button>
          <button
            type="button"
            className={mode === "all" ? "active" : ""}
            onClick={() => setMode("all")}
          >
            All <span>{stats?.ingested ?? 0}</span>
          </button>
        </div>

        <div className="toolbar-right">
          <label className="inline-field">
            <span className="micro-label">Min score</span>
            <input
              className="num-input"
              value={minScore}
              onChange={(event) => setMinScore(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              inputMode="numeric"
              aria-label="Minimum score"
            />
          </label>

          <label className="inline-field">
            <span className="micro-label">Sort</span>
            <select
              className="select-input"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort endpoints"
            >
              <option value="score">Score</option>
              <option value="path">Path</option>
              <option value="depth">Depth</option>
            </select>
          </label>

          <button
            type="button"
            className="btn ghost"
            onClick={onRescore}
            disabled={Boolean(busy)}
            title="Re-apply the current rules to this session"
          >
            Re-score
          </button>
        </div>
      </div>

      <div className={"split" + (selected ? " with-detail" : "")}>
        <div className="tablewrap">
          <table className="endpoints">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-score">Score</th>
                <th>Endpoint</th>
                <th className="col-signals">Signals</th>
                <th className="col-depth">Depth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((endpoint, index) => {
                const signals = signalsOf(endpoint);
                return (
                  <tr
                    key={endpoint.id}
                    className={
                      "row" +
                      (selectedId === endpoint.id ? " selected" : "") +
                      (endpoint.kept ? "" : " filtered")
                    }
                    onClick={() => setSelectedId(endpoint.id)}
                  >
                    <td className="col-rank mono dim">{String(index + 1).padStart(2, "0")}</td>
                    <td className="col-score">
                      <div className="score-cell">
                        <span className="score-num mono">
                          {endpoint.kept ? scoreLabel(endpoint.score) : "—"}
                        </span>
                        <span className="score-bar">
                          <i
                            style={{
                              width: `${Math.min(100, (endpoint.score / maxScore) * 100)}%`,
                            }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="col-endpoint">
                      <span className="method">{endpoint.method}</span>
                      <span className="endpoint-path mono" title={endpoint.url}>
                        {endpoint.template}
                        {endpoint.query ? <span className="query">{endpoint.query}</span> : null}
                      </span>
                      <span className="endpoint-host mono">{endpoint.host}</span>
                    </td>
                    <td className="col-signals">
                      {endpoint.kept ? (
                        signals.length ? (
                          <span className="signals">
                            {signals.map((signal) => (
                              <span key={signal} className="signal">
                                {signal}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="dim">—</span>
                        )
                      ) : (
                        <span className="filter-tag">
                          {endpoint.filterReason?.code}:{endpoint.filterReason?.detail}
                        </span>
                      )}
                    </td>
                    <td className="col-depth mono dim">{endpoint.depth}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!rows.length ? (
            <div className="empty-inline">
              <span className="micro-label">No matches</span>
              <p>
                {mode === "filtered"
                  ? "Nothing has been filtered out by the current rules."
                  : "No endpoints match this search or score floor."}
              </p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setQuery("");
                  setMinScore("");
                  setMode("ranked");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {selected ? <EndpointDetail endpoint={selected} onClose={() => setSelectedId(null)} /> : null}
      </div>
    </div>
  );
}
