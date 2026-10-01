"use strict"

const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("settings", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (cfg) => ipcRenderer.invoke("settings:save", cfg),
  close: () => ipcRenderer.invoke("settings:close"),
})
