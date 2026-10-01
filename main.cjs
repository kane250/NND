"use strict"

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog } = require("electron")
const { spawn } = require("node:child_process")
const path = require("node:path")
const http = require("node:http")
const fs = require("node:fs")
const net = require("node:net")
const crypto = require("node:crypto")

const APP_DIR = __dirname
const SERVER_ENTRY = path.join(APP_DIR, "app", "server", "index.mjs")
const VIEWER_HTML = path.join(APP_DIR, "viewer.html")
const VIEWER_PRELOAD = path.join(APP_DIR, "viewer-preload.cjs")
const SETTINGS_HTML = path.join(APP_DIR, "settings.html")
const SETTINGS_PRELOAD = path.join(APP_DIR, "settings-preload.cjs")

const DEFAULT_CONFIG = {
  autoRefresh: true,
  intervalMinutes: 10,
  viewerInApp: true, // 内置阅读器（关闭则点击在外部浏览器打开）
  windowBounds: null,
}

const userDataDir = app.getPath("userData")
const CONFIG_PATH = path.join(userDataDir, "config.json")

let config = loadConfig()
let serverProc = null
let serverPort = null
let mainWindow = null
let settingsWindow = null
let refreshTimer = null

const viewer = {
  toolbar: null,
  content: null,
  active: false,
}

// ---------- 配置 ----------
function loadConfig() {
  let cfg = { ...DEFAULT_CONFIG }
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
      cfg = { ...cfg, ...raw }
    }
  } catch (e) {
    console.error("读取配置失败，使用默认配置:", e)
  }
  return cfg
}

function saveConfig() {
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  } catch (e) {
    console.error("保存配置失败:", e)
  }
}

// ---------- 服务器 ----------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function pollReady(port, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/latest`, (res) => {
        res.resume()
        if (res.statusCode === 200) return resolve(true)
        if (Date.now() - start > timeoutMs) return reject(new Error("服务器就绪超时"))
        setTimeout(attempt, 300)
      })
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("服务器就绪超时"))
        setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SERVER_ENTRY)) {
      return reject(new Error("未找到服务端入口: " + SERVER_ENTRY + "\n请先运行 build.sh 构建 NewsNow，或从 Release 下载预构建包。"))
    }
    if (!fs.existsSync(path.join(APP_DIR, "app", "server", "node_modules", "better-sqlite3"))) {
      return reject(new Error("服务端依赖未安装。\n请先运行 setup.sh (Linux/macOS) 或 setup.bat (Windows) 安装原生依赖。"))
    }
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOST: "127.0.0.1",
      INIT_TABLE: "true",
      ENABLE_CACHE: "true",
      JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    }
    // 跨平台查找 node：优先 NODE_BIN 环境变量，其次 PATH 上的 node
    let nodeBin = process.env.NODE_BIN
    if (!nodeBin) {
      try { nodeBin = require("node:child_process").execSync(process.platform === "win32" ? "where node" : "which node", { encoding: "utf8" }).trim().split(/\r?\n/)[0] } catch (_) { nodeBin = "node" }
    }
    serverProc = spawn(nodeBin, [SERVER_ENTRY], {
      env,
      cwd: APP_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      // Windows 上需要 shell 处理路径中的空格
      shell: process.platform === "win32" && (!nodeBin || nodeBin.includes(" ")),
    })
    let stdoutBuf = ""
    serverProc.stdout.on("data", (d) => {
      stdoutBuf += d.toString()
      process.stdout.write("[newsnow-server] " + d)
    })
    serverProc.stderr.on("data", (d) => process.stderr.write("[newsnow-server] " + d))
    serverProc.on("exit", (code) => {
      console.log("NewsNow 服务进程退出，code=" + code)
      serverProc = null
    })
    pollReady(port).then(resolve).catch(reject)
  })
}

function stopServer() {
  if (serverProc) {
    try {
      if (process.platform === "win32") {
        // Windows 上 SIGTERM 不可靠，用 taskkill 强制终止进程树
        spawn("taskkill", ["/pid", String(serverProc.pid), "/f", "/t"], { stdio: "ignore" })
      } else {
        serverProc.kill("SIGTERM")
      }
    } catch (_) {}
    serverProc = null
  }
}

// ---------- 主窗口 ----------
function createMainWindow() {
  const bounds = config.windowBounds || { width: 1280, height: 840 }
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 560,
    title: "NewsNow 桌面版",
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`)

  // 键盘快捷键在主进程拦截：避免 Ctrl+R 触发浏览器默认整页刷新（丢滚动位置）
  mainWindow.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return
    if (input.control && !input.alt && !input.meta && !input.shift && (input.key === "r" || input.key === "R")) {
      e.preventDefault()
      refreshAll()
    } else if (input.control && !input.alt && !input.meta && !input.shift && input.key === ",") {
      e.preventDefault()
      openSettings()
    }
  })

  // 拦截 target=_blank / window.open，进入内置阅读器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank") return { action: "deny" }
    if (config.viewerInApp) {
      openViewer(url)
      return { action: "deny" }
    } else {
      shell.openExternal(url)
      return { action: "deny" }
    }
  })

  mainWindow.on("resize", () => {
    saveBounds()
    layoutViewer()
  })
  mainWindow.on("move", () => saveBounds())
  mainWindow.on("close", () => saveBounds())
}

function saveBounds() {
  if (!mainWindow) return
  try {
    config.windowBounds = mainWindow.getBounds()
    saveConfig()
  } catch (_) {}
}

// ---------- 刷新全部 ----------
const REFRESH_JS = `(function(){
  var btns = Array.from(document.querySelectorAll('button'));
  function has(b, kw){ return Array.from(b.classList).some(function(c){ return c.indexOf(kw)!==-1; }); }
  var count = 0;
  btns.forEach(function(b){
    if (has(b, 'arrow-counter-clockwise') && !has(b, 'circle-dashed') && !has(b, 'animate-spin')) {
      b.click(); count++;
    }
  });
  return count;
})()`

function refreshAll() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.executeJavaScript(REFRESH_JS, true)
    .then((count) => console.log("已触发刷新源数量:", count))
    .catch((e) => console.error("刷新失败:", e))
}

function setupRefreshTimer() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  if (config.autoRefresh) {
    const ms = Math.max(1, config.intervalMinutes) * 60 * 1000
    refreshTimer = setInterval(refreshAll, ms)
    console.log(`自动刷新已开启，间隔 ${config.intervalMinutes} 分钟`)
  } else {
    console.log("自动刷新已关闭")
  }
  updateMenu()
}

// ---------- 内置阅读器 ----------
function openViewer(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!viewer.toolbar) {
    viewer.toolbar = new WebContentsView({
      webPreferences: {
        preload: VIEWER_PRELOAD,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    viewer.content = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        partition: "persist:viewer",
      },
    })
    mainWindow.contentView.addChildView(viewer.toolbar)
    mainWindow.contentView.addChildView(viewer.content)

    // 工具栏 IPC
    ipcMain.handle("viewer:back", () => { if (viewer.content) viewer.content.webContents.navigationHistory.goBack() })
    ipcMain.handle("viewer:forward", () => { if (viewer.content) viewer.content.webContents.navigationHistory.goForward() })
    ipcMain.handle("viewer:reload", () => { if (viewer.content) viewer.content.webContents.reload() })
    ipcMain.handle("viewer:open-external", () => {
      if (viewer.content) {
        const u = viewer.content.webContents.getURL()
        if (u) shell.openExternal(u)
      }
    })
    ipcMain.handle("viewer:navigate", (_e, u) => {
      if (viewer.content && u) viewer.content.webContents.loadURL(u)
    })
    ipcMain.handle("viewer:close", () => closeViewer())
    ipcMain.handle("viewer:get-state", () => {
      if (!viewer.content) return null
      const wc = viewer.content.webContents
      try {
        return {
          url: wc.getURL(),
          canBack: wc.navigationHistory.canGoBack(),
          canForward: wc.navigationHistory.canGoForward(),
          isLoading: wc.isLoading(),
        }
      } catch (_) { return null }
    })

    // 内容页导航事件 -> 更新地址栏（轮询作为主路径，事件作为补充）
    const sendUrl = (u) => {
      if (viewer.toolbar && !viewer.toolbar.webContents.isDestroyed()) {
        viewer.toolbar.webContents.send("viewer:url", u || "")
      }
    }
    const sendNavState = () => {
      if (!viewer.content) return
      const wc = viewer.content.webContents
      try {
        const canBack = wc.navigationHistory.canGoBack()
        const canForward = wc.navigationHistory.canGoForward()
        if (viewer.toolbar && !viewer.toolbar.webContents.isDestroyed()) {
          viewer.toolbar.webContents.send("viewer:nav-state", { canBack, canForward })
        }
      } catch (_) {}
    }
    viewer.content.webContents.on("did-navigate", (_e, u) => { sendUrl(u) })
    viewer.content.webContents.on("did-navigate-in-page", (_e, u, isMain) => { if (isMain) sendUrl(u) })
    viewer.content.webContents.on("did-finish-load", () => { sendUrl(viewer.content.webContents.getURL()) })
    viewer.content.webContents.setWindowOpenHandler(({ url: u }) => {
      if (u) viewer.content.webContents.loadURL(u)
      return { action: "deny" }
    })

    viewer.toolbar.webContents.loadFile(VIEWER_HTML)
  }
  viewer.active = true
  viewer.content.webContents.loadURL(url)
  layoutViewer()
  updateMenu()
}

function closeViewer() {
  if (!viewer.active) return
  viewer.active = false
  layoutViewer()
  updateMenu()
  // 停止阅读内容加载以释放资源
  if (viewer.content) {
    try { viewer.content.webContents.stop() } catch (_) {}
  }
}

function layoutViewer() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [w, h] = mainWindow.getContentSize()
  const toolbarH = 46
  if (viewer.active && viewer.toolbar && viewer.content) {
    viewer.toolbar.setBounds({ x: 0, y: 0, width: w, height: toolbarH })
    viewer.content.setBounds({ x: 0, y: toolbarH, width: w, height: h - toolbarH })
    mainWindow.contentView.addChildView(viewer.toolbar)
    mainWindow.contentView.addChildView(viewer.content)
  } else {
    if (viewer.toolbar) mainWindow.contentView.removeChildView(viewer.toolbar)
    if (viewer.content) mainWindow.contentView.removeChildView(viewer.content)
  }
}

// ---------- 设置窗口 ----------
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "设置",
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      preload: SETTINGS_PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  settingsWindow.setMenuBarVisibility(false)
  settingsWindow.loadFile(SETTINGS_HTML)
  settingsWindow.on("closed", () => { settingsWindow = null })
}

ipcMain.handle("settings:load", () => ({
  autoRefresh: config.autoRefresh,
  intervalMinutes: config.intervalMinutes,
  viewerInApp: config.viewerInApp,
}))
ipcMain.handle("settings:save", (_e, cfg) => {
  config.autoRefresh = !!cfg.autoRefresh
  config.intervalMinutes = Math.max(1, Math.min(1440, Number(cfg.intervalMinutes) || 10))
  config.viewerInApp = cfg.viewerInApp !== false
  saveConfig()
  setupRefreshTimer()
  return true
})
ipcMain.handle("settings:close", () => {
  if (settingsWindow) settingsWindow.close()
})

// ---------- 菜单 ----------
function updateMenu() {
  Menu.setApplicationMenu(buildMenu())
}

function buildMenu() {
  const viewerActive = viewer.active
  const template = [
    {
      label: "NewsNow",
      submenu: [
        { label: "关于 NewsNow 桌面版", click: () => {
          dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "关于",
            message: "NewsNow 桌面版",
            detail: "基于 github.com/newsnext/newsnow 改造\n· 选择订阅源\n· 定期/按需刷新\n· 内置阅读器查看新闻\n\n由 TeleAgent 打包",
            buttons: ["确定"],
          })
        }},
        { type: "separator" },
        { label: "设置…", accelerator: "CmdOrCtrl+Comma", click: openSettings },
        { type: "separator" },
        { label: "退出", accelerator: "CmdOrCtrl+Q", role: "quit" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "刷新全部 (Ctrl+R)", click: refreshAll },
        { label: "重新加载页面", accelerator: "F5", click: () => mainWindow && mainWindow.reload() },
        { type: "separator" },
        { label: "放大", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
        { label: "缩小", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { label: "重置缩放", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { type: "separator" },
        { label: "自动刷新: " + (config.autoRefresh ? "开" : "关"), type: "checkbox", checked: config.autoRefresh, click: (it) => {
          config.autoRefresh = it.checked
          saveConfig()
          setupRefreshTimer()
        }},
        { label: "刷新间隔", submenu: [5, 10, 15, 30, 60].map((m) => ({
          label: `${m} 分钟`,
          type: "radio",
          checked: config.intervalMinutes === m,
          click: () => { config.intervalMinutes = m; saveConfig(); setupRefreshTimer() },
        }))},
      ],
    },
    {
      label: "阅读",
      enabled: viewerActive,
      submenu: [
        { label: "后退", accelerator: "Alt+Left", enabled: viewerActive, click: () => viewer.content && viewer.content.webContents.navigationHistory.goBack() },
        { label: "前进", accelerator: "Alt+Right", enabled: viewerActive, click: () => viewer.content && viewer.content.webContents.navigationHistory.goForward() },
        { label: "重新加载", accelerator: "CmdOrCtrl+Shift+R", enabled: viewerActive, click: () => viewer.content && viewer.content.webContents.reload() },
        { type: "separator" },
        { label: "在系统浏览器中打开", enabled: viewerActive, click: () => {
          if (viewer.content) { const u = viewer.content.webContents.getURL(); if (u) shell.openExternal(u) }
        }},
        { label: "返回新闻列表", accelerator: "Escape", enabled: viewerActive, click: closeViewer },
      ],
    },
    {
      label: "帮助",
      submenu: [
        { label: "NewsNow 项目主页", click: () => shell.openExternal("https://github.com/newsnext/newsnow") },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort()
    console.log("使用端口:", serverPort)
    await startServer(serverPort)
    console.log("NewsNow 服务就绪")
  } catch (e) {
    dialog.showErrorBox("启动失败", String(e && e.message || e))
    app.quit()
    return
  }
  createMainWindow()
  updateMenu()
  setupRefreshTimer()
})

app.on("window-all-closed", () => {
  stopServer()
  app.quit()
})

app.on("before-quit", () => {
  stopServer()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
