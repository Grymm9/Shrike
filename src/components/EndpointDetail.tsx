import { useState } from "react";
import type { Endpoint } from "../lib/types";
import { IconClose, IconCopy } from "./Icons";

interface EndpointDetailProps {
  endpoint: Endpoint;
  onClose: () => void;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
}

export function EndpointDetail({ endpoint, onClose }: EndpointDetailProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void copyText(endpoint.url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <aside className="detail" aria-label="Endpoint detail">
      <header className="detail-head">
        <span className="method">{endpoint.method}</span>
        <span className="detail-host mono">{endpoint.host}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close detail">
          <IconClose size={12} />
        </button>
      </header>

      <div className="detail-body">
        <section>
          <span className="micro-label">Template</span>
          <h2 className="detail-template mono">{endpoint.template}</h2>
          <div className="url-row">
            <code className="mono" title={endpoint.url}>
              {endpoint.url}
            </code>
            <button type="button" className="icon-btn" onClick={copy} title="Copy URL">
              <IconCopy size={12} />
            </button>
          </div>
          <span className="copy-state micro-label">{copied ? "copied" : ""}</span>
        </section>

        <section className="score-block">
          <div>
            <span className="score-big mono">{endpoint.kept ? endpoint.score : "—"}</span>
            <span className="score-caption">
              {endpoint.kept ? "EV score" : "excluded by rules"}
            </span>
          </div>
          <span className={"pill " + (endpoint.kept ? "pill-ok" : "pill-warn")}>
            {endpoint.kept ? "ranked" : "filtered"}
          </span>
        </section>

        {!endpoint.kept && endpoint.filterReason ? (
          <section className="notice warn">
            <span className="micro-label">Filter hit</span>
            <p>
              {endpoint.filterReason.code === "extension"
                ? `Ignored extension ${endpoint.filterReason.detail}`
                : `Ignored path segment ${endpoint.filterReason.detail}`}
            </p>
          </section>
        ) : null}

        <section>
          <h3 className="micro-label">Score breakdown</h3>
          {endpoint.reasons.length ? (
            <ul className="breakdown">
              {endpoint.reasons.map((reason, index) => (
                <li
                  key={`${reason.code}-${reason.label}-${index}`}
                  className={reason.code === "base" ? "base" : undefined}
                >
                  <span className="delta mono">
                    {reason.delta > 0 ? "+" : ""}
                    {reason.delta}
                  </span>
                  <span className="breakdown-label">{reason.label}</span>
                  <span className="breakdown-code micro-label">{reason.code}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim small">No scoring applied.</p>
          )}
        </section>

        <section>
          <h3 className="micro-label">Metadata</h3>
          <dl className="kv">
            <div>
              <dt>Host</dt>
              <dd className="mono">{endpoint.host}</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd className="mono">{endpoint.depth}</dd>
            </div>
            <div>
              <dt>Query</dt>
              <dd className="mono">{endpoint.query || "—"}</dd>
            </div>
            <div>
              <dt>Endpoint id</dt>
              <dd className="mono">{endpoint.id}</dd>
            </div>
          </dl>
        </section>

        <footer className="detail-note">
          Ranking only. Shrike v1 does not send requests to any target — every test stays in your
          own client.
        </footer>
      </div>
    </aside>
  );
}
