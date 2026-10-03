"use strict"

const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("settings", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (cfg) => ipcRenderer.invoke("settings:save", cfg),
  close: () => ipcRenderer.invoke("settings:close"),
  exportData: () => ipcRenderer.invoke("settings:export"),
  exportOpml: () => ipcRenderer.invoke("settings:export-opml"),
  importData: () => ipcRenderer.invoke("settings:import"),
  importOpml: () => ipcRenderer.invoke("settings:import-opml"),
  onImportOpmlProgress: (cb) => {
    const listener = (_e, p) => cb(p)
    ipcRenderer.on("import-opml-progress", listener)
    return () => ipcRenderer.removeListener("import-opml-progress", listener)
  },
})
