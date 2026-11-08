import { useState } from "react";
import type {
  BountyCache,
  LegacyEngagement,
  SavedViews,
  Settings,
  SortKey,
  UpdateState,
  WorkspacePaths,
} from "../lib/types";
import { formatRelative, formatStamp, plural } from "../lib/format";
import {
  IconArchive,
  IconDownload,
  IconExternal,
  IconFolder,
  IconSettings,
  IconSync,
  IconTrash,
} from "./Icons";

interface SettingsPanelProps {
  version: string;
  settings: Settings;
  paths: WorkspacePaths;
  legacy: LegacyEngagement[];
  views: SavedViews;
  cache: BountyCache;
  update: UpdateState;
  busy: string | null;
  onSetPrefs: (prefs: Partial<Settings["prefs"]>) => void;
  onRefreshBounties: () => void;
  onOpenWorkspace: () => void;
  onCheckUpdate: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenReleases: () => void;
  onArchiveLegacy: (id: string) => void;
  onDeleteLegacy: (id: string) => void;
  onArchiveAllLegacy: () => void;
  onDeleteAllLegacy: () => void;
}

export function SettingsPanel({
  version,
  settings,
  paths,
  legacy,
  views,
  cache,
  update,
  busy,
  onSetPrefs,
  onRefreshBounties,
  onOpenWorkspace,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenReleases,
  onArchiveLegacy,
  onDeleteLegacy,
  onArchiveAllLegacy,
  onDeleteAllLegacy,
}: SettingsPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const disabled = Boolean(busy);

  return (
    <div className="settings">
      <div className="settings-scroll">
        <section className="card settings-card update-card">
          <div className="card-head">
            <div>
              <h3>App updates</h3>
              <p>
                Installed build · v{version}. Updates replace app files only; saved data stays
                local.
              </p>
            </div>
            <span
              className={`pill ${
                update.status === "available" ||
                update.status === "downloaded" ||
                update.status === "error"
                  ? "pill-warn"
                  : update.status === "current"
                    ? "pill-active"
                    : ""
              }`}
            >
              {update.status === "available"
                ? `v${update.version} available`
                : update.status === "downloaded"
                  ? "Restart to install"
                  : update.status === "current"
                    ? "Up to date"
                    : update.status === "checking"
                      ? "Checking"
                      : update.status === "downloading"
                        ? "Downloading"
                        : update.status === "error"
                          ? "Check failed"
                          : "Installed"}
            </span>
          </div>

          <div className="update-body">
            <div className="update-status">
              <span className="micro-label">Status</span>
              <p>{update.message}</p>
              {update.notes &&
              (update.status === "available" || update.status === "downloaded") ? (
                <pre className="release-notes">{update.notes}</pre>
              ) : null}
              {update.status === "downloading" ? (
                <div className="update-progress">
                  <span className="progress-track">
                    <i style={{ width: `${Math.max(0, Math.min(100, update.percent))}%` }} />
                  </span>
                  <span className="mono">{Math.round(update.percent)}%</span>
                </div>
              ) : null}
            </div>

            <div className="update-actions">
              {update.status === "available" ? (
                <button type="button" className="btn primary" onClick={onDownloadUpdate} disabled={disabled}>
                  <IconDownload />
                  Download v{update.version}
                </button>
              ) : update.status === "downloaded" ? (
                <button type="button" className="btn primary" onClick={onInstallUpdate} disabled={disabled}>
                  Restart and install
                </button>
              ) : update.status === "downloading" ? (
                <button type="button" className="btn primary" disabled>
                  <IconDownload />
                  Downloading…
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={onCheckUpdate}
                  disabled={disabled || !update.packaged || update.status === "checking"}
                >
                  <IconSync />
                  {update.status === "checking" ? "Checking…" : "Check for updates"}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={onOpenReleases}>
                <IconExternal />
                Releases
              </button>
            </div>
          </div>

          <div className="update-foot">
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.prefs.autoCheckUpdates}
                onChange={(event) => onSetPrefs({ autoCheckUpdates: event.target.checked })}
                disabled={disabled}
              />
              <span>
                <strong>Check on launch</strong>
                <em>Notifies you; never installs without asking.</em>
              </span>
            </label>
            <span className="dim">Pre-install backup saved in config/backups.</span>
          </div>
        </section>

        <div className="settings-grid">
          <section className="card settings-card">
            <div className="card-head">
              <div>
                <h3>Preferences</h3>
              </div>
              <IconSettings size={16} className="card-icon" />
            </div>

            <div className="settings-form">
              <label className="field">
                <span className="micro-label">Default sort</span>
                <select
                  className="select-input"
                  value={settings.prefs.defaultSort}
                  onChange={(event) =>
                    onSetPrefs({ defaultSort: event.target.value as SortKey })
                  }
                  disabled={disabled}
                >
                  <option value="maxBounty">Top payout</option>
                  <option value="minBounty">Entry payout</option>
                  <option value="reports">Reports</option>
                  <option value="responseEfficiency">Response</option>
                  <option value="launched">Newest</option>
                  <option value="name">Name</option>
                </select>
              </label>

              <label className="field">
                <span className="micro-label">Default view</span>
                <select
                  className="select-input"
                  value={settings.prefs.defaultViewId ?? ""}
                  onChange={(event) =>
                    onSetPrefs({ defaultViewId: event.target.value || null })
                  }
                  disabled={disabled}
                >
                  <option value="">Custom filters</option>
                  {views.views.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="micro-label">Cache age</span>
                <select
                  className="select-input"
                  value={settings.prefs.cacheMinutes}
                  onChange={(event) =>
                    onSetPrefs({ cacheMinutes: Number(event.target.value) })
                  }
                  disabled={disabled}
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={240}>4 hours</option>
                </select>
              </label>
            </div>
          </section>

          <section className="card settings-card">
            <div className="card-head">
              <div>
                <h3>Data</h3>
                <p>Where the cache and saved views live.</p>
              </div>
              <span className="count-pill">{plural(cache.scanned, "bounty", "bounties")}</span>
            </div>

            <dl className="settings-facts stacked">
              <div>
                <dt>Workspace</dt>
                <dd className="mono path-trunc" title={paths.workspace}>
                  {paths.workspace}
                </dd>
              </div>
              <div>
                <dt>Cache</dt>
                <dd>{cache.fetchedAt ? `Read ${formatRelative(cache.fetchedAt)}` : "Never read"}</dd>
              </div>
              <div>
                <dt>Stamp</dt>
                <dd className="mono">{formatStamp(cache.fetchedAt)}</dd>
              </div>
            </dl>

            <div className="sync-actions">
              <button type="button" className="btn ghost" onClick={onOpenWorkspace}>
                <IconFolder />
                Open workspace
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={onRefreshBounties}
                disabled={disabled}
              >
                <IconSync />
                Refresh directory
              </button>
            </div>
          </section>
        </div>

        <section className="card settings-card">
          <div className="card-head">
            <div>
              <h3>Old engagement files</h3>
              <p>
                v1 endpoint lists in <code>sessions/</code>. Archive moves them to{" "}
                <code>archive/engagements/</code>; delete removes them.
              </p>
            </div>
            <span className="count-pill">{legacy.length}</span>
          </div>

          {legacy.length ? (
            <>
              <div className="legacy-actions">
                <button
                  type="button"
                  className="btn ghost tiny"
                  onClick={() => onArchiveAllLegacy()}
                  disabled={disabled}
                >
                  <IconArchive size={14} />
                  Archive all
                </button>
                <button
                  type="button"
                  className={"btn tiny " + (confirmAll ? "danger" : "ghost")}
                  onClick={() => {
                    if (confirmAll) {
                      onDeleteAllLegacy();
                      setConfirmAll(false);
                    } else {
                      setConfirmAll(true);
                    }
                  }}
                  disabled={disabled}
                >
                  <IconTrash size={14} />
                  {confirmAll ? "Confirm delete all" : "Delete all"}
                </button>
                {confirmAll ? (
                  <button
                    type="button"
                    className="btn ghost tiny"
                    onClick={() => setConfirmAll(false)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>

              <div className="legacy-table">
                {legacy.map((item) => (
                  <div className="legacy-row" key={item.id}>
                    <span className="legacy-name" title={item.id}>
                      {item.name}
                    </span>
                    <span className="mono dim">
                      {plural(item.endpointCount, "endpoint")}
                    </span>
                    <span className="mono dim">{formatRelative(item.updatedAt)}</span>
                    <span className="row-actions">
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => onArchiveLegacy(item.id)}
                        disabled={disabled}
                      >
                        <IconArchive size={14} />
                        Archive
                      </button>
                      <button
                        type="button"
                        className={"btn tiny " + (confirmId === item.id ? "danger" : "ghost")}
                        onClick={() => {
                          if (confirmId === item.id) {
                            onDeleteLegacy(item.id);
                            setConfirmId(null);
                          } else {
                            setConfirmId(item.id);
                          }
                        }}
                        disabled={disabled}
                      >
                        <IconTrash size={14} />
                        {confirmId === item.id ? "Confirm" : "Delete"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-note">No old engagement files left.</p>
          )}
        </section>

        <section className="card settings-card about-card">
          <div>
            <span className="micro-label">About</span>
            <h3>Shrike {version}</h3>
            <p>
              A local bounty board. Filter public programs, save what matters, and update the
              app from GitHub Releases.
            </p>
          </div>
          <div className="about-meta">
            <span className="pill pill-active">No target traffic</span>
            <span className="pill">Local data</span>
          </div>
        </section>
      </div>
    </div>
  );
}
