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
  openSessionsDir: () => invoke("app:open-sessions"),
  openWorkspace: () => invoke("app:open-workspace"),

  saveRules: (rules, activeSessionId) => invoke("settings:save-rules", rules, activeSessionId),
  resetRules: (activeSessionId) => invoke("settings:reset-rules", activeSessionId),
  setAutoPush: (enabled) => invoke("settings:set-autopush", enabled),

  pushNow: () => invoke("sync:push"),
  pullNow: () => invoke("sync:pull"),
  setRemote: (url) => invoke("sync:set-remote", url),

  listSessions: () => invoke("sessions:list"),
  createSession: (name) => invoke("sessions:create", name),
  getSession: (id) => invoke("sessions:get", id),
  renameSession: (id, name) => invoke("sessions:rename", id, name),
  deleteSession: (id) => invoke("sessions:delete", id),
  ingest: (payload) => invoke("sessions:ingest", payload),
  rescore: (id) => invoke("sessions:rescore", id),

  onSyncStatus: (callback) => subscribe("sync:status", callback),
  onSessionsChanged: (callback) => subscribe("sessions:changed", callback),
});
