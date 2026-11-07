import { useEffect, useMemo, useState } from "react";
import type { GitState, KeywordRule, Rules, Session, Settings, Weights } from "../lib/types";
import { formatRelative } from "../lib/format";
import { previewEndpoints, rulesHash } from "../lib/engine";
import { IconClose, IconFolder, IconPlus } from "./Icons";

interface RulesPanelProps {
  settings: Settings;
  session: Session | null;
  git: GitState | null;
  busy: string | null;
  workspace: string;
  onSave: (rules: Rules) => void;
  onReset: () => void;
  onSetRemote: (url: string) => void;
  onSetAutoPush: (enabled: boolean) => void;
  onPush: () => void;
  onOpenWorkspace: () => void;
}

interface ChipListProps {
  title: string;
  hint: string;
  items: string[];
  placeholder: string;
  normalise: (value: string) => string;
  onChange: (items: string[]) => void;
  disabled?: boolean;
}

function ChipList({
  title,
  hint,
  items,
  placeholder,
  normalise,
  onChange,
  disabled,
}: ChipListProps) {
  const [value, setValue] = useState("");

  function add() {
    const next = normalise(value);
    if (!next) return;
    if (items.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setValue("");
      return;
    }
    onChange([...items, next]);
    setValue("");
  }

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        <span className="count-pill mono">{items.length}</span>
      </header>

      <div className="chips">
        {items.map((item) => (
          <span key={item} className="chip mono">
            {item}
            <button
              type="button"
              className="chip-x"
              onClick={() => onChange(items.filter((entry) => entry !== item))}
              disabled={disabled}
              aria-label={`Remove ${item}`}
            >
              <IconClose size={9} />
            </button>
          </span>
        ))}
        {!items.length ? <span className="dim small">Nothing ignored.</span> : null}
      </div>

      <div className="add-row">
        <input
          className="input mono"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn ghost tiny" onClick={add} disabled={disabled}>
          <IconPlus size={11} />
          Add
        </button>
      </div>
    </section>
  );
}

const WEIGHT_FIELDS: Array<{ key: keyof Weights; label: string; hint: string }> = [
  { key: "base", label: "Base", hint: "Every endpoint starts here" },
  { key: "numericId", label: "Numeric id", hint: "Per numeric path segment" },
  { key: "uuid", label: "UUID", hint: "Per UUID path segment" },
  { key: "sensitiveParam", label: "Object param", hint: "Path or query param match" },
  { key: "queryParam", label: "Query params", hint: "Per query parameter, max 3" },
  { key: "depth", label: "Depth", hint: "Per segment beyond three" },
];

function normaliseExtensionInput(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  const dotted = raw.startsWith(".") ? raw : "." + raw;
  return /^\.[a-z0-9][a-z0-9._-]*$/.test(dotted) ? dotted : "";
}

function normaliseSegmentInput(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  return /^[a-z0-9._~{}-]+(\/[a-z0-9._~{}-]+)*$/.test(raw) ? "/" + raw : "";
}

function normaliseParamInput(value: string): string {
  const raw = value.trim().toLowerCase();
  return /^[a-z0-9_.-]+$/.test(raw) ? raw : "";
}

export function RulesPanel({
  settings,
  session,
  git,
  busy,
  workspace,
  onSave,
  onReset,
  onSetRemote,
  onSetAutoPush,
  onPush,
  onOpenWorkspace,
}: RulesPanelProps) {
  const [draft, setDraft] = useState<Rules>(settings.rules);
  const [remote, setRemote] = useState(git?.remote ?? "");
  const [keywordValue, setKeywordValue] = useState("");
  const [keywordWeight, setKeywordWeight] = useState("6");
  const [probe, setProbe] = useState("/api/v2/orders/104881?expand=items");

  useEffect(() => {
    setDraft(settings.rules);
  }, [settings.rules]);

  useEffect(() => {
    setRemote(git?.remote ?? "");
  }, [git?.remote]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings.rules),
    [draft, settings.rules],
  );

  const sessionStale = Boolean(session && session.rulesHash !== rulesHash(settings.rules));
  const disabled = Boolean(busy);

  const probeResult = useMemo(() => {
    if (!probe.trim()) return null;
    const preview = previewEndpoints(probe, draft);
    return preview.endpoints[0] ?? null;
  }, [probe, draft]);

  function update(patch: Partial<Rules>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addKeyword() {
    const value = keywordValue.trim().toLowerCase();
    if (!value || !/^[a-z0-9._-]+$/.test(value)) return;
    if (draft.keywords.some((keyword) => keyword.value === value)) {
      setKeywordValue("");
      return;
    }
    const weight = Math.max(0, Math.min(100, Number(keywordWeight) || 0));
    update({ keywords: [...draft.keywords, { value, weight }] });
    setKeywordValue("");
  }

  function patchKeyword(index: number, patch: Partial<KeywordRule>) {
    update({
      keywords: draft.keywords.map((keyword, i) =>
        i === index ? { ...keyword, ...patch } : keyword,
      ),
    });
  }

  return (
    <div className="rules">
      <div className="rules-scroll">
        <section className="card sync-settings">
          <header className="card-head">
            <div>
              <h3>GitHub sync</h3>
              <p>
                Session JSON in <code>/sessions</code> is committed and pushed in the background.
                Pull brings the latest from <code>origin/main</code>.
              </p>
            </div>
            <span className={`status-dot phase-${git?.phase ?? "idle"}`} />
          </header>

          <div className="sync-grid">
            <label className="field grow">
              <span className="micro-label">Remote URL</span>
              <div className="add-row flush">
                <input
                  className="input mono"
                  value={remote}
                  onChange={(event) => setRemote(event.target.value)}
                  placeholder="git@github.com:you/shrike-sessions.git"
                  spellCheck={false}
                  disabled={disabled}
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onSetRemote(remote)}
                  disabled={disabled || remote.trim() === (git?.remote ?? "")}
                >
                  Save remote
                </button>
              </div>
            </label>

            <div className="field">
              <span className="micro-label">Auto-push</span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.sync.autoPush}
                className={"switch" + (settings.sync.autoPush ? " on" : "")}
                onClick={() => onSetAutoPush(!settings.sync.autoPush)}
                disabled={disabled}
              >
                <span />
                <em>{settings.sync.autoPush ? "On" : "Off"}</em>
              </button>
            </div>

            <div className="field">
              <span className="micro-label">State</span>
              <div className="sync-line">
                <span className={`status-dot phase-${git?.phase ?? "idle"}`} />
                <span className="mono small">{git?.message ?? "Ready"}</span>
              </div>
              <span className="dim small">Last sync {formatRelative(git?.lastSyncAt ?? null)}</span>
            </div>
          </div>

          <div className="sync-actions">
            <button type="button" className="btn ghost" onClick={onPush} disabled={disabled || !git?.remote}>
              Push now
            </button>
            <button type="button" className="btn ghost" onClick={onOpenWorkspace}>
              <IconFolder size={12} />
              Open workspace
            </button>
            <span className="path-trunc dim small" title={workspace}>
              {workspace}
            </span>
          </div>
        </section>

        <div className="rules-grid">
          <ChipList
            title="Ignored extensions"
            hint="Any endpoint whose last path segment ends in one of these is removed before scoring."
            items={draft.ignoredExtensions}
            placeholder=".css"
            normalise={normaliseExtensionInput}
            onChange={(items) => update({ ignoredExtensions: items })}
            disabled={disabled}
          />
          <ChipList
            title="Ignored path segments"
            hint="Matched as whole segments, so /health does not catch /healthcare."
            items={draft.ignoredSegments}
            placeholder="/static"
            normalise={normaliseSegmentInput}
            onChange={(items) => update({ ignoredSegments: items })}
            disabled={disabled}
          />
          <ChipList
            title="Object parameters"
            hint="Param names that indicate an object boundary. A match adds the object-param weight."
            items={draft.sensitiveParams}
            placeholder="order_id"
            normalise={normaliseParamInput}
            onChange={(items) => update({ sensitiveParams: items })}
            disabled={disabled}
          />
        </div>

        <section className="card">
          <header className="card-head">
            <div>
              <h3>Priority keywords</h3>
              <p>
                Matched against path and query tokens. A keyword scores once per endpoint, at its
                own weight.
              </p>
            </div>
            <span className="count-pill mono">{draft.keywords.length}</span>
          </header>

          <div className="keyword-table">
            <div className="keyword-head micro-label">
              <span>Keyword</span>
              <span>Weight</span>
              <span />
            </div>
            {draft.keywords.map((keyword, index) => (
              <div className="keyword-row" key={keyword.value}>
                <span className="mono keyword-value">{keyword.value}</span>
                <input
                  className="num-input"
                  value={keyword.weight}
                  inputMode="numeric"
                  disabled={disabled}
                  onChange={(event) => {
                    const weight = event.target.value.replace(/[^0-9]/g, "");
                    patchKeyword(index, { weight: Number(weight || 0) });
                  }}
                  aria-label={`Weight for ${keyword.value}`}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    update({ keywords: draft.keywords.filter((_, i) => i !== index) })
                  }
                  disabled={disabled}
                  aria-label={`Remove ${keyword.value}`}
                >
                  <IconClose size={10} />
                </button>
              </div>
            ))}

            <div className="keyword-add">
              <input
                className="input mono"
                value={keywordValue}
                placeholder="keyword"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setKeywordValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <input
                className="num-input"
                value={keywordWeight}
                inputMode="numeric"
                disabled={disabled}
                onChange={(event) => setKeywordWeight(event.target.value.replace(/[^0-9]/g, ""))}
                aria-label="New keyword weight"
              />
              <button type="button" className="btn ghost tiny" onClick={addKeyword} disabled={disabled}>
                <IconPlus size={11} />
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <div>
              <h3>Scoring weights</h3>
              <p>
                Score is a sum of weighted signals. Higher weight means that signal matters more
                when ranking.
              </p>
            </div>
          </header>

          <div className="weights-grid">
            {WEIGHT_FIELDS.map((field) => (
              <label className="weight-field" key={field.key}>
                <span className="micro-label">{field.label}</span>
                <input
                  className="num-input wide"
                  value={draft.weights[field.key]}
                  inputMode="numeric"
                  disabled={disabled}
                  onChange={(event) => {
                    const value = Number(event.target.value.replace(/[^0-9]/g, "") || 0);
                    update({ weights: { ...draft.weights, [field.key]: value } });
                  }}
                />
                <span className="dim small">{field.hint}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card probe-card">
          <header className="card-head">
            <div>
              <h3>Rule probe</h3>
              <p>Test a URL against the draft rules before you save them.</p>
            </div>
          </header>

          <input
            className="input mono"
            value={probe}
            onChange={(event) => setProbe(event.target.value)}
            spellCheck={false}
            placeholder="/api/v2/orders/104881"
            aria-label="Rule probe URL"
          />

          <div className="probe-result">
            {!probe.trim() ? (
              <span className="dim small">Enter a path to test.</span>
            ) : !probeResult ? (
              <span className="pill pill-warn">unparseable</span>
            ) : !probeResult.kept ? (
              <>
                <span className="pill pill-warn">filtered</span>
                <span className="mono small">
                  {probeResult.filterReason?.code}:{probeResult.filterReason?.detail}
                </span>
              </>
            ) : (
              <>
                <span className="pill pill-ok">score {probeResult.score}</span>
                <span className="probe-reasons">
                  {probeResult.reasons
                    .filter((reason) => reason.code !== "base")
                    .map((reason, index) => (
                      <span key={`${reason.code}-${index}`} className="signal">
                        {reason.label} +{reason.delta}
                      </span>
                    ))}
                </span>
              </>
            )}
          </div>
        </section>
      </div>

      <footer className="rules-foot">
        <div className="rules-foot-left">
          <span className={"dirty-dot" + (dirty ? " on" : "")} />
          <span className="micro-label">
            {dirty ? "Unsaved rule changes" : "Rules saved"}
          </span>
          {sessionStale ? (
            <span className="pill pill-warn" title="This session was scored with older rules">
              session scored with older rules
            </span>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onReset} disabled={disabled}>
            Reset to defaults
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onSave(draft)}
            disabled={disabled || !dirty}
          >
            {busy === "rules" ? "Saving…" : "Save & re-score"}
          </button>
        </div>
      </footer>
    </div>
  );
}
