"use strict"

const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("viewer", {
  back: () => ipcRenderer.invoke("viewer:back"),
  forward: () => ipcRenderer.invoke("viewer:forward"),
  reload: () => ipcRenderer.invoke("viewer:reload"),
  openExternal: () => ipcRenderer.invoke("viewer:open-external"),
  navigate: (u) => ipcRenderer.invoke("viewer:navigate", u),
  close: () => ipcRenderer.invoke("viewer:close"),
  getState: () => ipcRenderer.invoke("viewer:get-state"),
  onUrl: (cb) => ipcRenderer.on("viewer:url", (_e, u) => cb(u)),
  onNavState: (cb) => ipcRenderer.on("viewer:nav-state", (_e, s) => cb(s)),
})
