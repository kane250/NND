"use strict"

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog, protocol } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

const APP_DIR = __dirname
const DATA_LAYER = path.join(APP_DIR, "data-layer.mjs")
const WEB_DIR = path.join(APP_DIR, "web")
const VIEWER_HTML = path.join(APP_DIR, "viewer.html")
const VIEWER_PRELOAD = path.join(APP_DIR, "viewer-preload.cjs")
const SETTINGS_HTML = path.join(APP_DIR, "settings.html")
const SETTINGS_PRELOAD = path.join(APP_DIR, "settings-preload.cjs")

const VERSION = "2.0.0"

const DEFAULT_CONFIG = {
  autoRefresh: true,
  intervalMinutes: 10,
  viewerInApp: true, // 内置阅读器（关闭则点击在外部浏览器打开）
  windowBounds: null,
}

const userDataDir = app.getPath("userData")
const CONFIG_PATH = path.join(userDataDir, "config.json")

let config = loadConfig()
let dataLayer = null
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

// ---------- 数据层（主进程直抓，无子进程） ----------

// 桌面持久化存储：JSON 文件 + 防抖写入，注入给数据层 cache 模块
function initDesktopStorage() {
  const storePath = path.join(userDataDir, "data-cache.json")
  let store = {}
  try {
    if (fs.existsSync(storePath)) store = JSON.parse(fs.readFileSync(storePath, "utf8"))
  } catch (e) {
    console.warn("数据缓存读取失败，从空缓存开始:", e)
  }
  let saveTimer = null
  const flush = () => {
    try {
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(storePath, JSON.stringify(store))
    } catch (e) {
      console.warn("数据缓存写入失败:", e)
    }
  }
  globalThis.__DESKTOP_STORAGE__ = {
    get: async (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    set: async (k, v) => {
      store[k] = v
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(flush, 500)
    },
  }
  // 数据层 fetch 模块靠此标记启用 Node fetch 分支（无 CORS，支持 getSetCookie）
  globalThis.__ELECTRON_MAIN__ = true
}

async function loadDataLayer() {
  if (!fs.existsSync(DATA_LAYER)) {
    throw new Error("未找到数据层: " + DATA_LAYER + "\n请运行 node scripts/build-data.mjs 构建。")
  }
  if (!fs.existsSync(path.join(WEB_DIR, "index.html"))) {
    throw new Error("未找到前端资源: " + WEB_DIR + "\n请运行 build.sh 构建或从 Release 下载预构建包。")
  }
  dataLayer = await import(DATA_LAYER)
  console.log("数据层加载完成，源数量:", Object.keys(dataLayer.sources).length)
}

// ---------- app:// 协议（静态资源 + API） ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

async function handleApi(pathname, url, request) {
  // 版本信息（原 /api/latest）
  if (pathname === "/api/latest") return jsonResponse({ v: VERSION })
  // 登录禁用（前端 useLogin 靠 enable 字段判断）
  if (pathname === "/api/enable-login") return jsonResponse({ enable: false })
  // 多端同步：无登录态，返回空数据（前端有 jwt 才调用）
  if (pathname === "/api/me/sync") return jsonResponse({ data: { sources: [] }, updatedTime: 0 })
  // 单源获取
  if (pathname === "/api/s") {
    const id = url.searchParams.get("id")
    const latest = url.searchParams.get("latest")
    if (!id) return jsonResponse({ status: "error", id: "", updatedTime: Date.now(), items: [] }, 400)
    try {
      const res = await dataLayer.getSourceData(id, latest === "1" || latest === "true")
      return jsonResponse(res)
    } catch (e) {
      console.warn(`源 ${id} 获取失败:`, e && e.message)
      return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 500)
    }
  }
  // 批量获取（POST body: {sources: string[]}）
  if (pathname === "/api/s/entire") {
    try {
      let sources = []
      if (request.uploadData && request.uploadData.length) {
        const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
        const body = JSON.parse(raw)
        sources = body.sources || []
      }
      const res = await dataLayer.getEntireData(sources)
      return jsonResponse(res)
    } catch (e) {
      console.warn("entire 接口失败:", e && e.message)
      return jsonResponse([], 500)
    }
  }
  return new Response("Not Found", { status: 404 })
}

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)

    // API 分支（standard scheme 的 pathname 带前导 "/"）
    if (pathname.startsWith("/api/")) {
      return handleApi(pathname, url, request)
    }

    // 静态资源（SPA fallback 到 index.html）
    const rel = pathname === "/" ? "index.html" : pathname.slice(1)
    let filePath = path.normalize(path.join(WEB_DIR, rel))
    if (!filePath.startsWith(WEB_DIR)) {
      filePath = path.join(WEB_DIR, "index.html")
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(WEB_DIR, "index.html")
    }
    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
      })
    } catch (e) {
      return new Response("Internal Error", { status: 500 })
    }
  })
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

  mainWindow.loadURL("app://local/index.html")

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
            message: "NewsNow 桌面版 v" + VERSION,
            detail: "基于 github.com/newsnext/newsnow 改造\n· 选择订阅源\n· 定期/按需刷新\n· 内置阅读器查看新闻\n\nv2.0：主进程直抓架构（无子进程、无原生模块）\n\n由 TeleAgent 打包",
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
// 自定义协议需在 app ready 前注册权限
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

app.whenReady().then(async () => {
  try {
    initDesktopStorage()
    registerAppProtocol()
    await loadDataLayer()
    console.log("NewsNow 桌面版 v" + VERSION + " 就绪（直抓模式，无子进程）")
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
  app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
