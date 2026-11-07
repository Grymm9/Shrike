import { useEffect, useMemo, useRef, useState } from "react";
import type { Rules, Session } from "../lib/types";
import { previewEndpoints } from "../lib/engine";
import { IconClose, IconFolder } from "./Icons";

interface IngestDialogProps {
  session: Session | null;
  rules: Rules;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    raw: string;
    mode: "replace" | "append";
    sourceName: string | null;
  }) => void;
}

export function IngestDialog({ session, rules, busy, onClose, onSubmit }: IngestDialogProps) {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => previewEndpoints(raw, rules), [raw, rules]);
  const kept = preview.endpoints.filter((endpoint) => endpoint.kept).length;
  const filtered = preview.endpoints.length - kept;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function readFile(file: File) {
    const text = await file.text();
    setRaw(text);
    setSourceName(file.name);
    if (session && session.endpoints.length) setMode("append");
  }

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={"modal" + (dragging ? " dragging" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Import endpoints"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void readFile(file);
        }}
      >
        <header className="modal-head">
          <div>
            <span className="micro-label">Recon intake</span>
            <h2>Import endpoints</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <IconClose size={13} />
          </button>
        </header>

        <div className="modal-body">
          <div className="import-toolbar">
            <button
              type="button"
              className="btn ghost"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <IconFolder size={12} />
              Load file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,.csv,.log,.lst,text/plain"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
            <span className="dim small">
              {sourceName ?? "Paste below, or drop a .txt / .csv here"}
            </span>
            <div className="import-mode">
              <button
                type="button"
                className={mode === "replace" ? "active" : ""}
                onClick={() => setMode("replace")}
                disabled={busy}
              >
                Replace
              </button>
              <button
                type="button"
                className={mode === "append" ? "active" : ""}
                onClick={() => setMode("append")}
                disabled={busy || !session}
              >
                Append
              </button>
            </div>
          </div>

          <textarea
            className="import-area mono"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              if (sourceName) setSourceName(null);
            }}
            placeholder={
              "https://api.example.com/v1/orders/1042\n" +
              "GET /v1/users/55021/profile?expand=team\n" +
              "/v1/invoices/9f1c2d7e-4a55-4c31-9b0e-11d2a7c9e001.pdf\n" +
              "api.example.com/v1/tenants/acme/exports"
            }
            spellCheck={false}
            disabled={busy}
          />

          <div className="preview-strip">
            <span className="preview-cell">
              <span className="micro-label">Lines</span>
              <b className="mono">{preview.counts.lines}</b>
            </span>
            <span className="preview-cell">
              <span className="micro-label">Unique</span>
              <b className="mono">{preview.endpoints.length}</b>
            </span>
            <span className="preview-cell ok">
              <span className="micro-label">Kept</span>
              <b className="mono">{kept}</b>
            </span>
            <span className="preview-cell warn">
              <span className="micro-label">Filtered</span>
              <b className="mono">{filtered}</b>
            </span>
            <span className="preview-cell">
              <span className="micro-label">Dupes</span>
              <b className="mono">{preview.counts.duplicates}</b>
            </span>
            <span className="preview-cell">
              <span className="micro-label">Invalid</span>
              <b className="mono">{preview.counts.invalid}</b>
            </span>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="dim small">
            Scored with the current rules. You can re-score at any time without re-importing.
          </span>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !raw.trim() || !session}
              onClick={() => onSubmit({ raw, mode, sourceName })}
            >
              {busy ? "Importing…" : mode === "append" ? "Append & score" : "Import & score"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
