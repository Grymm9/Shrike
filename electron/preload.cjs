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

  listBounties: (source) => invoke("bounties:list", source),
  refreshBounties: (source) => invoke("bounties:refresh", source),
  exportCsv: (payload) => invoke("export:csv", payload),

  setPrefs: (prefs) => invoke("settings:set-prefs", prefs),

  saveViews: (views) => invoke("views:save", views),
  setShortlist: (payload) => invoke("shortlist:set", payload),
  removeShortlist: (id) => invoke("shortlist:remove", id),

  listLegacy: () => invoke("legacy:list"),
  archiveLegacy: (id) => invoke("legacy:archive", id),
  deleteLegacy: (id) => invoke("legacy:delete", id),
  archiveAllLegacy: () => invoke("legacy:archive-all"),
  deleteAllLegacy: () => invoke("legacy:delete-all"),

  onBountiesChanged: (callback) => subscribe("bounties:changed", callback),
  onBountyProgress: (callback) => subscribe("bounties:progress", callback),
  onUpdateStatus: (callback) => subscribe("update:status", callback),
});
