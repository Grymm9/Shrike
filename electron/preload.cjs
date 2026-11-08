const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("shrike", {
  bootstrap: (activeId) => invoke("app:bootstrap", activeId),
  openWorkspace: () => invoke("app:open-workspace"),
  openExternal: (url) => invoke("app:open-external", url),

  listBounties: () => invoke("bounties:list"),
  refreshBounties: () => invoke("bounties:refresh"),
  exportCsv: (payload) => invoke("export:csv", payload),

  setAutoPush: (enabled) => invoke("settings:set-autopush", enabled),
  setPrefs: (prefs) => invoke("settings:set-prefs", prefs),

  checkForUpdates: () => invoke("update:check"),
  downloadUpdate: () => invoke("update:download"),
  installUpdate: () => invoke("update:install"),
  updateState: () => invoke("update:state"),

  saveViews: (views) => invoke("views:save", views),
  setShortlist: (payload) => invoke("shortlist:set", payload),
  removeShortlist: (id) => invoke("shortlist:remove", id),

  pushNow: () => invoke("sync:push"),
  pullNow: () => invoke("sync:pull"),
  setRemote: (url) => invoke("sync:set-remote", url),

  listLegacy: () => invoke("legacy:list"),
  archiveLegacy: (id) => invoke("legacy:archive", id),
  deleteLegacy: (id) => invoke("legacy:delete", id),
  archiveAllLegacy: () => invoke("legacy:archive-all"),
  deleteAllLegacy: () => invoke("legacy:delete-all"),

  onSyncStatus: (callback) => subscribe("sync:status", callback),
  onBountiesChanged: (callback) => subscribe("bounties:changed", callback),
  onBountyProgress: (callback) => subscribe("bounties:progress", callback),
  onDataChanged: (callback) => subscribe("data:changed", callback),
  onUpdateStatus: (callback) => subscribe("update:status", callback),
});
