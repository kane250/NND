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
  rssList: () => ipcRenderer.invoke("settings:rss-list"),
  rssAdd: (v) => ipcRenderer.invoke("settings:rss-add", v),
  rssRemove: (v) => ipcRenderer.invoke("settings:rss-remove", v),
  onImportOpmlProgress: (cb) => {
    const listener = (_e, p) => cb(p)
    ipcRenderer.on("import-opml-progress", listener)
    return () => ipcRenderer.removeListener("import-opml-progress", listener)
  },
})
