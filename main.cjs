"use strict"

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog, protocol, Tray, nativeImage, Notification } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const { mergeBookmarks, mergeHistory, mergeRssFeeds, applyImportedSettings } = require("./merge-data.cjs")

// 自动更新（仅打包后生效，开发模式跳过）
let autoUpdater = null
try { autoUpdater = require("electron-updater").autoUpdater } catch (_) {}

const APP_DIR = __dirname
const DATA_LAYER = path.join(APP_DIR, "data-layer.mjs")
const WEB_DIR = path.join(APP_DIR, "web")
const VIEWER_HTML = path.join(APP_DIR, "viewer.html")
const VIEWER_PRELOAD = path.join(APP_DIR, "viewer-preload.cjs")
const SETTINGS_HTML = path.join(APP_DIR, "settings.html")
const SETTINGS_PRELOAD = path.join(APP_DIR, "settings-preload.cjs")

const VERSION = "2.6.0"
const BUILD_DATE = "2026-10-03"
const APP_NAME = "NND"
const APP_FULL_NAME = "NewsNow Desktop"
const PROJECT_HOME = "https://github.com/kane250/NND"
const ORIGINAL_PROJECT = "https://github.com/newsnext/newsnow"

const DEFAULT_CONFIG = {
  autoRefresh: true,
  intervalMinutes: 10,
  viewerInApp: true, // 内置阅读器（关闭则点击在外部浏览器打开）
  windowBounds: null,
  theme: "dark", // dark / light
  readerFontSize: 16, // 阅读器字体大小 (px)
  readerLineHeight: 1.8, // 阅读器行距
  rssFeeds: [], // 自定义 RSS 源列表 [{id, name, url}]
}

// ---------- 数据持久化（书签/历史/RSS） ----------
const userDataDir = app.getPath("userData")
const CONFIG_PATH = path.join(userDataDir, "config.json")
const BOOKMARKS_PATH = path.join(userDataDir, "bookmarks.json")
const HISTORY_PATH = path.join(userDataDir, "history.json")

let config = loadConfig()
let dataLayer = null
let mainWindow = null
let settingsWindow = null
let refreshTimer = null
let tray = null
let isQuiting = false

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
  // Windows 上 ESM import() 要求 file:// URL，不能直接用 C:\ 路径
  const { pathToFileURL } = require("node:url")
  dataLayer = await import(pathToFileURL(DATA_LAYER).href)
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

// ---------- 通用 RSS/Atom Feed 解析器 ----------
async function fetchRssFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "NND/2.1 RSS Reader" },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const items = []
  // 简易 XML 解析（不依赖 DOMParser，用正则提取 item/entry）
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi
  let m
  while ((m = itemRe.exec(text)) !== null && items.length < 30) {
    const block = m[1]
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || ""
    const link = block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim()
      || block.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim() || ""
    const pubDate = block.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1]?.trim() || ""
    const desc = block.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/i)?.[1]?.trim() || ""
    if (title && link) {
      items.push({
        id: link,
        title: title.replace(/<[^>]+>/g, ""),
        url: link,
        mobileUrl: link,
        hot: 0,
        pubDate: pubDate ? new Date(pubDate).getTime() || Date.now() : Date.now(),
        description: desc.replace(/<[^>]+>/g, "").slice(0, 200),
      })
    }
  }
  return items
}

// ---------- 内容智能工具函数 ----------

// 标题相似度去重：同一批次内标题相似度 > 0.8 的合并（保留热度更高的）
function deduplicateItems(items) {
  if (!items || !items.length) return items
  const result = []
  for (const item of items) {
    let isDup = false
    for (const existing of result) {
      if (titleSimilarity(item.title, existing.title) > 0.8) {
        isDup = true
        // 合并：保留热度更高的，累加来源数
        if ((item.hot || 0) > (existing.hot || 0)) {
          existing.hot = item.hot
          existing.title = item.title
        }
        existing._sources = (existing._sources || 1) + 1
        break
      }
    }
    if (!isDup) result.push({ ...item, _sources: 1 })
  }
  return result
}

// 标题相似度（2-gram Jaccard，对中文和英文都鲁棒）
function titleSimilarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const normalize = s => s.toLowerCase().replace(/\s+/g, "")
  const na = normalize(a), nb = normalize(b)
  // 生成 2-gram 集合
  const grams = (s, n) => { const g = new Set(); for (let i = 0; i <= s.length - n; i++) g.add(s.slice(i, i + n)); return g }
  const ga = grams(na, 2), gb = grams(nb, 2)
  if (ga.size === 0 || gb.size === 0) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  return inter / (ga.size + gb.size - inter)
}

// 阅读时间估算（基于标题/描述字数，中文按 300 字/分钟，英文按 200 词/分钟）
function estimateReadTime(text) {
  if (!text) return 1
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const words = (text.replace(/[\u4e00-\u9fa5]/g, " ").match(/[a-zA-Z]+/g) || []).length
  const minutes = Math.ceil(chinese / 300 + words / 200)
  return Math.max(1, minutes)
}

// 去重 + 阅读时间增强：给每个 item 添加 _readTime 和 _sources
function enhanceItems(items) {
  const deduped = deduplicateItems(items)
  return deduped.map(item => ({
    ...item,
    _readTime: estimateReadTime((item.title || "") + " " + (item.description || "")),
    _sources: item._sources || 1,
  }))
}

async function handleApi(pathname, url, request) {
  // 版本信息（原 /api/latest）
  if (pathname === "/api/latest") return jsonResponse({ v: VERSION })
  // 登录禁用（前端 useLogin 靠 enable 字段判断）
  if (pathname === "/api/enable-login") return jsonResponse({ enable: false })
  // 多端同步：无登录态，返回空数据（前端有 jwt 才调用）
  if (pathname === "/api/me/sync") return jsonResponse({ data: { sources: [] }, updatedTime: 0 })
  // 单源获取（内置源 + 自定义 RSS）
  if (pathname === "/api/s") {
    const id = url.searchParams.get("id")
    const latest = url.searchParams.get("latest")
    if (!id) return jsonResponse({ status: "error", id: "", updatedTime: Date.now(), items: [] }, 400)
    // 自定义 RSS 源
    if (id.startsWith("rss-")) {
      const feed = (config.rssFeeds || []).find(f => f.id === id)
      if (!feed) return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 404)
      try {
        const items = await fetchRssFeed(feed)
        return jsonResponse({ status: "ok", id, updatedTime: Date.now(), items: enhanceItems(items) })
      } catch (e) {
        console.warn(`RSS 源 ${feed.url} 获取失败:`, e.message)
        return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 500)
      }
    }
    // 内置源
    try {
      const res = await dataLayer.getSourceData(id, latest === "1" || latest === "true")
      if (res && res.items) res.items = enhanceItems(res.items)
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
      // 增强每个源的数据（去重 + 阅读时间）
      if (Array.isArray(res)) {
        res.forEach(src => { if (src && src.items) src.items = enhanceItems(src.items) })
      }
      return jsonResponse(res)
    } catch (e) {
      console.warn("entire 接口失败:", e && e.message)
      return jsonResponse([], 500)
    }
  }
  // ---------- 书签 API ----------
  if (pathname === "/api/bookmarks") {
    try {
      const bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8"))
      return jsonResponse(bookmarks)
    } catch (_) { return jsonResponse([]) }
  }
  if (pathname === "/api/bookmarks/add" && request.method === "POST") {
    try {
      const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
      const item = JSON.parse(raw)
      let bookmarks = []
      try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8")) } catch (_) {}
      // 去重（按 url）
      bookmarks = bookmarks.filter(b => b.url !== item.url)
      bookmarks.unshift({ ...item, savedAt: Date.now() })
      fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify(bookmarks, null, 2))
      return jsonResponse({ ok: true, count: bookmarks.length })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  if (pathname === "/api/bookmarks/remove" && request.method === "POST") {
    try {
      const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
      const { url } = JSON.parse(raw)
      let bookmarks = []
      try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8")) } catch (_) {}
      bookmarks = bookmarks.filter(b => b.url !== url)
      fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify(bookmarks, null, 2))
      return jsonResponse({ ok: true, count: bookmarks.length })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  // ---------- 阅读历史 API ----------
  if (pathname === "/api/history") {
    try {
      const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"))
      return jsonResponse(history)
    } catch (_) { return jsonResponse([]) }
  }
  if (pathname === "/api/history/add" && request.method === "POST") {
    try {
      const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
      const item = JSON.parse(raw)
      let history = []
      try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) } catch (_) {}
      // 去重（按 url），保留最近 200 条
      history = history.filter(h => h.url !== item.url)
      history.unshift({ ...item, readAt: Date.now() })
      if (history.length > 200) history = history.slice(0, 200)
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
      return jsonResponse({ ok: true, count: history.length })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  if (pathname === "/api/history/clear" && request.method === "POST") {
    try {
      fs.writeFileSync(HISTORY_PATH, "[]")
      return jsonResponse({ ok: true })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  // ---------- 自定义 RSS 源 API ----------
  if (pathname === "/api/rss") {
    return jsonResponse(config.rssFeeds || [])
  }
  if (pathname === "/api/rss/add" && request.method === "POST") {
    try {
      const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
      const { name, url } = JSON.parse(raw)
      if (!url) return jsonResponse({ ok: false, error: "URL 不能为空" }, 400)
      const id = "rss-" + Date.now()
      const feed = { id, name: name || url, url }
      config.rssFeeds = config.rssFeeds || []
      config.rssFeeds.push(feed)
      saveConfig()
      return jsonResponse({ ok: true, feed })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  if (pathname === "/api/rss/remove" && request.method === "POST") {
    try {
      const raw = Buffer.from(request.uploadData[0].bytes).toString("utf8")
      const { id } = JSON.parse(raw)
      config.rssFeeds = (config.rssFeeds || []).filter(f => f.id !== id)
      saveConfig()
      return jsonResponse({ ok: true })
    } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500) }
  }
  // 自定义 RSS 源数据获取（/api/s?id=rss-xxx）
  if (pathname === "/api/s") {
    const id = url.searchParams.get("id")
    const latest = url.searchParams.get("latest")
    if (!id) return jsonResponse({ status: "error", id: "", updatedTime: Date.now(), items: [] }, 400)
    // 自定义 RSS 源
    if (id.startsWith("rss-")) {
      const feed = (config.rssFeeds || []).find(f => f.id === id)
      if (!feed) return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 404)
      try {
        const items = await fetchRssFeed(feed)
        return jsonResponse({ status: "ok", id, updatedTime: Date.now(), items })
      } catch (e) {
        console.warn(`RSS 源 ${feed.url} 获取失败:`, e.message)
        return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 500)
      }
    }
    // 内置源
    try {
      const res = await dataLayer.getSourceData(id, latest === "1" || latest === "true")
      return jsonResponse(res)
    } catch (e) {
      console.warn(`源 ${id} 获取失败:`, e && e.message)
      return jsonResponse({ status: "error", id, updatedTime: Date.now(), items: [] }, 500)
    }
  }
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
      let data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()

      // 对 index.html 注入版本+编译日期显示脚本
      if (rel === "index.html" || filePath === path.join(WEB_DIR, "index.html")) {
        const html = data.toString("utf8")
        const injectScript = `
<script>
(function(){
  var VERSION="${VERSION}";
  var BUILD_DATE="${BUILD_DATE}";
  window.__BUILD_INFO__ = { version: VERSION, buildDate: BUILD_DATE };
  function injectBadge() {
    var header = document.querySelector('header') || document.querySelector('[class*="justify-self-end"]');
    if (!header) { setTimeout(injectBadge, 200); return; }
    // 找到右上角的 flex 容器（含 GoTop/Refresh/Github/Menu）
    var right = header.querySelector('.justify-self-end');
    if (!right) { setTimeout(injectBadge, 200); return; }
    if (document.getElementById('build-badge')) return;
    var badge = document.createElement('span');
    badge.id = 'build-badge';
    badge.style.cssText = 'font-size:11px;opacity:.5;font-family:ui-monospace,monospace;padding:0 6px;white-space:nowrap;cursor:default;user-select:none;';
    badge.textContent = 'v' + VERSION + ' · ' + BUILD_DATE;
    badge.title = APP_FULL_NAME + ' v' + VERSION + ' (构建于 ' + BUILD_DATE + ')';
    right.insertBefore(badge, right.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(injectBadge, 500); });
  } else {
    setTimeout(injectBadge, 500);
  }
  // 持续重试（前端 React 异步渲染）
  var retries = 0;
  var timer = setInterval(function(){
    if (document.getElementById('build-badge') || retries++ > 30) { clearInterval(timer); return; }
    injectBadge();
  }, 1000);
})();
</script>`
        const injected = html.replace("</body>", injectScript + "\n</body>")
        data = Buffer.from(injected, "utf8")
      }

      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": MIME[ext] || "application/octet-stream",
          // 禁用缓存：前端资源可能被本地补丁修改，Chromium 启发式缓存会返回旧版导致 UI 不更新
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
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
    title: APP_NAME,
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // 使用独立入口 index-v2.html（引用重命名后的 bundle），完全规避 Chromium 对 index.html 的启发式缓存
  mainWindow.loadURL("app://local/index-v2.html?v=" + BUILD_DATE.replace(/[^0-9]/g, ""))

  // 注入主题控制 + 书签/历史/搜索功能
  mainWindow.webContents.on("dom-ready", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          var theme = ${JSON.stringify(config.theme || "dark")};
          if (theme === "light") {
            document.documentElement.classList.remove("dark");
          } else {
            document.documentElement.classList.add("dark");
          }
          // 书签/历史/搜索面板注入
          if (window.__nndInjected) return;
          window.__nndInjected = true;
          var css = \`
            #nnd-panel{position:fixed;top:0;right:0;width:380px;height:100vh;background:#1a1a1e;color:#e6e6e6;z-index:999999;box-shadow:-4px 0 24px rgba(0,0,0,.4);display:none;flex-direction:column;font:14px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif;}
            #nnd-panel.open{display:flex;}
            #nnd-panel .header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #2e2e34;}
            #nnd-panel .header h2{font-size:15px;font-weight:600;margin:0;}
            #nnd-panel .header .close{cursor:pointer;font-size:20px;opacity:.5;padding:4px 8px;}
            #nnd-panel .header .close:hover{opacity:1;}
            #nnd-panel .tabs{display:flex;gap:0;border-bottom:1px solid #2e2e34;}
            #nnd-panel .tabs button{flex:1;padding:10px;background:none;border:0;border-bottom:2px solid transparent;color:#999;cursor:pointer;font-size:13px;}
            #nnd-panel .tabs button.active{color:#e6e6e6;border-bottom-color:#6c8cff;}
            #nnd-panel .content{flex:1;overflow-y:auto;padding:8px;}
            #nnd-panel .content .item{padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;}
            #nnd-panel .content .item:hover{background:#222228;}
            #nnd-panel .content .item .title{font-size:13px;font-weight:500;margin-bottom:3px;}
            #nnd-panel .content .item .meta{font-size:11px;opacity:.5;}
            #nnd-panel .content .item .del{float:right;opacity:0;cursor:pointer;}
            #nnd-panel .content .item:hover .del{opacity:.6;}
            #nnd-panel .content .del:hover{opacity:1;}
            #nnd-panel .empty{text-align:center;padding:40px 20px;opacity:.4;}
            #nnd-panel .search-bar{padding:8px 12px;border-bottom:1px solid #2e2e34;}
            #nnd-panel .search-bar input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid #3a3a40;background:#222228;color:#e6e6e6;font-size:13px;outline:none;}
            #nnd-panel .search-bar input:focus{border-color:#6c8cff;}
            #nnd-panel .actions{padding:8px 12px;border-top:1px solid #2e2e34;display:flex;gap:8px;}
            #nnd-panel .actions button{flex:1;padding:8px;border-radius:6px;border:1px solid #3a3a40;background:#26262c;color:#e6e6e6;cursor:pointer;font-size:12px;}
            #nnd-panel .actions button:hover{background:#32323a;}
            #nnd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:999998;display:none;}
            #nnd-overlay.open{display:block;}
          \`;
          var styleEl = document.createElement("style");
          styleEl.textContent = css;
          document.head.appendChild(styleEl);

          // Overlay
          var overlay = document.createElement("div");
          overlay.id = "nnd-overlay";
          overlay.onclick = function(){ panel.classList.remove("open"); overlay.classList.remove("open"); };
          document.body.appendChild(overlay);

          // Panel
          var panel = document.createElement("div");
          panel.id = "nnd-panel";
          panel.innerHTML = \`
            <div class="header"><h2 id="nnd-panel-title">书签</h2><span class="close" id="nnd-close">&times;</span></div>
            <div class="tabs">
              <button data-tab="bookmarks" class="active">书签</button>
              <button data-tab="history">历史</button>
              <button data-tab="search">搜索</button>
            </div>
            <div class="search-bar" style="display:none;" id="nnd-search-bar">
              <input id="nnd-search-input" placeholder="搜索已加载的新闻..." autocomplete="off">
            </div>
            <div class="content" id="nnd-content"></div>
            <div class="actions" id="nnd-actions" style="display:none;"><button id="nnd-clear-history">清除全部历史</button></div>
          \`;
          document.body.appendChild(panel);

          var currentTab = "bookmarks";
          var content = document.getElementById("nnd-content");

          function fmtTime(ts){var d=new Date(ts);return d.getMonth()+1+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}

          async function loadBookmarks() {
            try {
              var r = await fetch("app://local/api/bookmarks");
              var items = await r.json();
              if (!items.length) { content.innerHTML = '<div class="empty">暂无书签</div>'; return; }
              content.innerHTML = items.map(function(b){
                return '<div class="item" data-url="'+b.url+'"><span class="del" data-del="'+b.url+'">&times;</span><div class="title">'+b.title+'</div><div class="meta">'+fmtTime(b.savedAt)+' · '+(b.source||"")+'</div></div>';
              }).join("");
            } catch(e) { content.innerHTML = '<div class="empty">加载失败</div>'; }
          }

          async function loadHistory() {
            try {
              var r = await fetch("app://local/api/history");
              var items = await r.json();
              if (!items.length) { content.innerHTML = '<div class="empty">暂无阅读历史</div>'; return; }
              content.innerHTML = items.map(function(h){
                return '<div class="item" data-url="'+h.url+'"><div class="title">'+h.title+'</div><div class="meta">'+fmtTime(h.readAt)+' · '+(h.source||"")+'</div></div>';
              }).join("");
            } catch(e) { content.innerHTML = '<div class="empty">加载失败</div>'; }
          }

          function doSearch(q) {
            if (!q || q.length < 2) { content.innerHTML = '<div class="empty">输入至少 2 个字符</div>'; return; }
            // 从当前页面卡片中搜索
            var links = document.querySelectorAll("a[href]");
            var results = [];
            links.forEach(function(a) {
              var t = a.textContent.trim();
              if (t && t.length > 3 && t.toLowerCase().indexOf(q.toLowerCase()) > -1) {
                results.push({url: a.href, title: t, src: a.closest("[data-source]") ? a.closest("[data-source]").getAttribute("data-source") : ""});
              }
            });
            if (!results.length) { content.innerHTML = '<div class="empty">未找到匹配结果</div>'; return; }
            content.innerHTML = results.slice(0, 50).map(function(r){
              return '<div class="item" data-url="'+r.url+'"><div class="title">'+r.title+'</div><div class="meta">'+r.src+'</div></div>';
            }).join("");
          }

          function switchTab(tab) {
            currentTab = tab;
            document.querySelectorAll("#nnd-panel .tabs button").forEach(function(b){b.classList.toggle("active", b.dataset.tab === tab);});
            document.getElementById("nnd-panel-title").textContent = tab === "bookmarks" ? "书签" : tab === "history" ? "历史" : "搜索";
            document.getElementById("nnd-search-bar").style.display = tab === "search" ? "block" : "none";
            document.getElementById("nnd-actions").style.display = tab === "history" ? "flex" : "none";
            if (tab === "bookmarks") loadBookmarks();
            else if (tab === "history") loadHistory();
            else { content.innerHTML = '<div class="empty">输入关键词搜索已加载的新闻</div>'; }
          }

          // 事件
          panel.querySelectorAll(".tabs button").forEach(function(b){
            b.onclick = function(){ switchTab(b.dataset.tab); };
          });
          document.getElementById("nnd-close").onclick = function(){ panel.classList.remove("open"); overlay.classList.remove("open"); };
          document.getElementById("nnd-search-input").oninput = function(e){ doSearch(e.target.value); };
          document.getElementById("nnd-clear-history").onclick = async function(){
            await fetch("app://local/api/history/clear", {method:"POST"});
            loadHistory();
          };
          content.addEventListener("click", function(e){
            var del = e.target.closest(".del");
            if (del) {
              e.stopPropagation();
              var url = del.dataset.del;
              fetch("app://local/api/bookmarks/remove", {method:"POST",body:JSON.stringify({url:url})});
              loadBookmarks();
              return;
            }
            var item = e.target.closest(".item");
            if (item && item.dataset.url) {
              // 记录阅读历史
              var title = item.querySelector(".title") ? item.querySelector(".title").textContent : "";
              fetch("app://local/api/history/add", {method:"POST",body:JSON.stringify({url:item.dataset.url, title:title})});
              // 在内置阅读器中打开
              if (window.__nndOpenUrl) window.__nndOpenUrl(item.dataset.url);
            }
          });

          // 暴露面板控制 + 书签功能给主进程
          window.__nndTogglePanel = function() {
            if (panel.classList.contains("open")) {
              panel.classList.remove("open"); overlay.classList.remove("open");
            } else {
              panel.classList.add("open"); overlay.classList.add("open");
              switchTab(currentTab);
            }
          };
          window.__nndAddBookmark = function(url, title, source) {
            fetch("app://local/api/bookmarks/add", {method:"POST",body:JSON.stringify({url:url, title:title, source:source||""})});
          };
        })();
      `, true)
    } catch (e) {}
  })

  // 键盘快捷键在主进程拦截：避免 Ctrl+R 触发浏览器默认整页刷新（丢滚动位置）
  mainWindow.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return
    if (input.control && !input.alt && !input.meta && !input.shift && (input.key === "r" || input.key === "R")) {
      e.preventDefault()
      refreshAll()
    } else if (input.control && !input.alt && !input.meta && !input.shift && input.key === ",") {
      e.preventDefault()
      openSettings()
    } else if (input.control && !input.alt && !input.meta && !input.shift && (input.key === "b" || input.key === "B")) {
      e.preventDefault()
      mainWindow.webContents.executeJavaScript("window.__nndTogglePanel && window.__nndTogglePanel()", true)
    } else if (input.control && !input.alt && !input.meta && input.shift && (input.key === "f" || input.key === "F")) {
      e.preventDefault()
      mainWindow.webContents.executeJavaScript("window.__nndTogglePanel && (function(){window.__nndTogglePanel();var b=document.querySelector('#nnd-panel .tabs button[data-tab=search]');if(b)b.click();var i=document.getElementById('nnd-search-input');if(i)setTimeout(function(){i.focus();},100);})()", true)
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
  // 拦截关闭按钮：最小化到托盘而非退出（除非用户从菜单/托盘选择退出）
  mainWindow.on("close", (e) => {
    saveBounds()
    if (!isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function saveBounds() {
  if (!mainWindow) return
  try {
    config.windowBounds = mainWindow.getBounds()
    saveConfig()
  } catch (_) {}
}

// ---------- 系统托盘 ----------
function createTray() {
  // 用 web/ 里的 pwa 图标作为托盘图标（缩放到 22x22 适配托盘）
  let icon
  const iconPath = path.join(WEB_DIR, "pwa-192x192.png")
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
    else icon = icon.resize({ width: 22, height: 22 })
  } catch (_) {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip(APP_NAME + " — NewsNow Desktop")

  // 托盘右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => showMainWindow() },
    { label: "刷新全部", click: refreshAll },
    { label: "书签/历史/搜索", click: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        showMainWindow()
        mainWindow.webContents.executeJavaScript("window.__nndTogglePanel && window.__nndTogglePanel()", true)
      }
    }},
    { type: "separator" },
    { label: "设置…", click: openSettings },
    { label: "关于…", click: () => {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "关于",
        message: APP_NAME + " (NewsNow Desktop) v" + VERSION,
        detail: APP_NAME + " — 跨平台新闻聚合阅读器\n\n" +
          "版权所有 © 2026 TeleAgent\n" +
          "项目主页：" + PROJECT_HOME + "\n\n" +
          "基于原项目 NewsNow 改造\n" +
          "原项目地址：" + ORIGINAL_PROJECT + "\n" +
          "原作者：ourongxing\n\n" +
          "v2.0：主进程直抓架构（无子进程、无原生模块）\n" +
          "由 TeleAgent 打包",
        buttons: ["确定"],
      })
    }},
    { type: "separator" },
    { label: "退出", click: () => quitApp() },
  ])
  tray.setContextMenu(contextMenu)

  // 单击托盘图标：切换窗口显示/隐藏
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        showMainWindow()
      }
    }
  })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    updateMenu()
  } else if (mainWindow.isVisible()) {
    // 已可见时聚焦
    mainWindow.focus()
  } else {
    // 隐藏状态：显示并聚焦
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function quitApp() {
  isQuiting = true
  if (tray) { tray.destroy(); tray = null }
  app.quit()
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
        autoplayPolicy: "document-user-activation-required",
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

    // 注入禁止媒体自动播放 + 广告拦截 CSS+JS（每次页面加载后执行）
    const AD_BLOCK_CSS = `
/* —— 禁止媒体自动播放 —— */
video{--muted:1}video,audio{autoplay:0!important;-webkit-autoplay:0!important}video[autoplay],audio[autoplay]{display:none!important}

/* —— EasyList 精简规则：通用广告/推广/弹窗元素隐藏 —— */

/* 通用广告选择器（ID/class 含 ad/banner/sponsor/promo/popup/overlay） */
[id^="ad-"],[id^="ad_"],[id^="ads-"],[id^="ads_"],[id*="-ad-"],[id*="_ad_"],[id$="-ad"],[id$="_ad"],
[id^="banner-ad"],[id^="google-ad"],[id^="div-gpt-ad"],[id^="google_ads_"],
[class*="ad-banner"],[class*="ad-container"],[class*="ad-wrapper"],[class*="ad-slot"],
[class*="advertisement"],[class*="ad-300"],[class*="ad-728"],[class*="ad-160"],
[class*="google-ad"],[class*="adsbygoogle"],[class*="ad-placement"],
[id^="popunder"],[id^="popup-ad"],[class*="popup-ad"],[class*="pop-up-ad"],
[class*="sponsor-ad"],[id*="sponsor-ad"],[class*="promo-ad"],[class*="promotion-ad"],
{display:none!important}

/* 通用广告容器 */
div[class*="ad_banner"],div[class*="adBox"],div[class*="ad-area"],div[class*="ad-zone"],
div[class*="ad-zone"],div[class*="adbox"],div[id*="adbox"],
div[class*="ggad"],div[id*="ggad"],
{display:none!important}

/* 弹窗/浮层广告 */
[class*="modal-ad"],[class*="overlay-ad"],[class*="float-ad"],[class*="fixed-ad"],
[class*="sticky-ad"],[class*="bottom-ad"],[class*="top-ad"],[class*="side-ad"],
[class*="full-screen-ad"],[class*="interstitial-ad"],
{display:none!important}

/* 「推广」「赞助」「广告」文字标记的容器 */
div[class*="推广"],div[class*="赞助"],div[class*="广告"],
span[class*="推广"],span[class*="赞助"],span[class*="广告"],
{display:none!important}

/* 通用——新闻网站常见广告位 */
[class*="ad_content"],[class*="ad_top"],[class*="ad_bottom"],[class*="ad_left"],[class*="ad_right"],
[class*="top-banner"],[class*="bottom-banner"],[class*="header-banner"],[class*="footer-banner"],
[class*="sidebar-ad"],[class*="content-ad"],[class*="article-ad"],[class*="in-article-ad"],
[class*="recommend-ad"],[class*="related-ad"],[class*="comment-ad"],
{display:none!important}

/* iframe 广告（非主内容） */
iframe[src*="doubleclick.net"],iframe[src*="googlesyndication"],iframe[src*="googleads"],
iframe[src*="adserver"],iframe[src*="adsystem"],iframe[src*="/ad/"],iframe[src*="/ads/"],
iframe[src*="ad_delivery"],iframe[src*="adify"],
{display:none!important}

/* —— 国内新闻网站特定规则 —— */

/* 36氪 */
[class*="ad-recommend"],[class*="ad-modal"],.article-bottom-ad,
/* 澎湃新闻 */
.thepaper-ad,.ad-down,[class*="adSidebar"],
/* 知乎 */
.PublicOpinion AdWrap,.ContentItemAdWrap,[class*="ad-banner"],.PcWordAdWrap,
/* 百度热搜/百家号 */
#cms-article-related-ad,[class*="ad-wrap"],.integral-text-ad,
/* 腾讯新闻 */
.ad-banner,[class*="qqad"],[id*="qqad"],
/* 微博 */
.WB_ad,[class*="WB_ad"],[class*="wbad"],
/* IT之家 */
#ad_post,[class*="ad-post"],.ad-content,
/* 虎嗅 */
[class*="ad-article"],[class*="ad-bottom"],
/* 少数派 */
[class*="sponsor"],[class*="ad-card"],
/* 哔哩哔哩 */
.bilibili-ad,[class*="bilibili-ad"],#bilibili-ad,
/* 抖音 */
.ad-container,[class*="ad-feed"],
{display:none!important}

/* —— 通用「阅读优化」—— */

/* 移除「下载 App」浮层/横幅（常见于移动端适配的新闻站） */
[class*="download-app"],[class*="download-bar"],[class*="app-download"],
[class*="open-app"],[class*="openApp"],[class*="app-promo"],
[id*="open-app"],[id*="downloadApp"],
{display:none!important}

/* 移除「关注/订阅」弹窗 */
[class*="follow-prompt"],[class*="subscribe-prompt"],[class*="login-prompt"],
[class*="register-modal"],[class*="signup-modal"],
{display:none!important}

/* 移除返回顶部浮动按钮中的广告 */
[class*="back-top-ad"],[class*="float-ad"],
{display:none!important}

/* —— 微调阅读体验 —— */

/* 禁用 fixed/sticky 定位的干扰元素（保留阅读器工具栏自身） */
body > [style*="position:fixed"][style*="z-index"]:not(header):not(nav),
body > [style*="position: fixed"][style*="z-index"]:not(header):not(nav),
{display:none!important}

/* —— 阅读优化：字体大小 + 行距 + 页边距 —— */
article, .article, .article-content, .article-body, .content-article,
.post-content, .entry-content, .news-content, .main-content,
.rich-text, .text-content, .article-detail, .article-text,
[itemprop="articleBody"], [class*="article-body"], [class*="article-content"],
{font-size:${config.readerFontSize || 16}px !important; line-height:${config.readerLineHeight || 1.8} !important;}

/* 文章正文段落间距 */
article p, .article p, .article-content p, .article-body p,
.post-content p, .entry-content p, .news-content p, .main-content p,
.rich-text p, .text-content p, [itemprop="articleBody"] p,
{margin-bottom: 1em !important;}

/* 文章正文最大宽度（提高长文可读性） */
article, .article, .article-content, .article-body, .content-article,
{max-width: 780px !important; margin-left: auto !important; margin-right: auto !important;}
`
    const NO_AUToplay_JS = `(function(){
      // 移除所有 autoplay 属性
      document.querySelectorAll('video[autoplay],audio[autoplay]').forEach(function(m){ m.removeAttribute('autoplay'); m.pause(); });
      // 拦截后续动态插入的自动播放元素
      if (window.__nnNoAutoplayObs) return;
      window.__nnNoAutoplayObs = new MutationObserver(function(muts){
        muts.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if (n.nodeType!==1) return;
            if (n.tagName==='VIDEO'||n.tagName==='AUDIO'){ n.removeAttribute('autoplay'); try{n.pause()}catch(e){} }
            n.querySelectorAll&&n.querySelectorAll('video[autoplay],audio[autoplay]').forEach(function(el){ el.removeAttribute('autoplay'); try{el.pause()}catch(e){} });
          });
        });
      });
      window.__nnNoAutoplayObs.observe(document.documentElement||document.body||document, {childList:true,subtree:true});
      // 拦截 play() 调用（静默阻止自动播放，用户手动点击播放仍可生效）
      if (!window.__nnPlayPatched) {
        window.__nnPlayPatched = true;
        var proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (proto && proto.play) {
          var origPlay = proto.play;
          proto.play = function(){
            // 仅阻止「非用户手势触发」的自动播放
            if (!window.__nnAllowPlay) {
              try { this.pause(); } catch(e){}
              return Promise.reject(new DOMException('autoplay blocked','NotAllowedError'));
            }
            return origPlay.apply(this, arguments);
          };
        }
      }
      // 标记允许播放（用户点击播放控件时设置）
      document.addEventListener('pointerdown', function(){ window.__nnAllowPlay = true; }, {passive:true, capture:true});
      document.addEventListener('keydown', function(){ window.__nnAllowPlay = true; }, {passive:true, capture:true});
    })();`

    viewer.content.webContents.on("did-navigate", (_e, u) => { sendUrl(u) })
    viewer.content.webContents.on("did-navigate-in-page", (_e, u, isMain) => { if (isMain) sendUrl(u) })
    viewer.content.webContents.on("did-finish-load", () => {
      sendUrl(viewer.content.webContents.getURL())
    })
    // dom-ready: 尽早注入禁止自动播放 + 内容智能（在页面脚本执行前）
    viewer.content.webContents.on("dom-ready", () => {
      if (!viewer.content) return
      try {
        viewer.content.webContents.insertCSS(AD_BLOCK_CSS)
        viewer.content.webContents.executeJavaScript(NO_AUToplay_JS, true)
        // 内容智能注入：阅读时间 + 关键词高亮支持
        viewer.content.webContents.executeJavaScript(`
          (function() {
            if (window.__nndSmartInjected) return;
            window.__nndSmartInjected = true;

            // —— 阅读时间估算浮标 ——
            function calcReadTime() {
              var article = document.querySelector('article, .article, .article-content, .article-body, .post-content, .entry-content, [itemprop="articleBody"]');
              if (!article) return 0;
              var text = article.innerText || '';
              var chinese = (text.match(/[\\u4e00-\\u9fa5]/g) || []).length;
              var words = (text.replace(/[\\u4e00-\\u9fa5]/g, ' ').match(/[a-zA-Z]+/g) || []).length;
              return Math.max(1, Math.ceil(chinese / 300 + words / 200));
            }
            function showReadTime() {
              var existing = document.getElementById('nnd-readtime');
              if (existing) return;
              var minutes = calcReadTime();
              if (minutes <= 1) return;
              var badge = document.createElement('div');
              badge.id = 'nnd-readtime';
              badge.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(0,0,0,.75);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;z-index:999999;backdrop-filter:blur(8px);font-family:system-ui,sans-serif;';
              badge.innerHTML = '\\u23F1\\uFE0F 约 ' + minutes + ' 分钟阅读';
              document.body.appendChild(badge);
              setTimeout(function(){ badge.style.transition='opacity .5s'; badge.style.opacity='0'; }, 5000);
            }
            setTimeout(showReadTime, 2000);

            // —— 关键词高亮（由主进程搜索面板触发） ——
            window.__nndHighlight = function(keyword) {
              if (!keyword || keyword.length < 2) return;
              // 移除已有高亮
              document.querySelectorAll('.nnd-hl').forEach(function(el){
                var p = el.parentNode; p.replaceChild(document.createTextNode(el.textContent), el); p.normalize();
              });
              var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, null);
              var nodes = []; var node;
              while ((node = walker.nextNode())) {
                if (node.parentNode.tagName !== 'SCRIPT' && node.parentNode.tagName !== 'STYLE' && node.textContent.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
                  nodes.push(node);
                }
              }
              nodes.forEach(function(n) {
                var text = n.textContent; var lower = text.toLowerCase();
                var idx = lower.indexOf(keyword.toLowerCase());
                if (idx === -1) return;
                var span = document.createElement('span');
                span.innerHTML = text.slice(0, idx) + '<mark style="background:#ffeb3b;padding:1px 2px;border-radius:2px;">' + text.slice(idx, idx + keyword.length) + '</mark>' + text.slice(idx + keyword.length);
                n.parentNode.replaceChild(span, n);
                span.outerHTML = span.innerHTML; // unwrap
              });
            };
          })();
        `, true)
        console.log("[viewer] 广告拦截 + 禁止自动播放 + 内容智能已注入")
      } catch (e) { console.warn("[viewer] 注入失败:", e) }
    })
    viewer.content.webContents.setWindowOpenHandler(({ url: u }) => {
      if (u) viewer.content.webContents.loadURL(u)
      return { action: "deny" }
    })

    viewer.toolbar.webContents.loadFile(VIEWER_HTML)
  }

  viewer.active = true
  viewer.content.webContents.loadURL(url)
  // 记录阅读历史
  try {
    const items = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"))
    items.unshift({ url, title: url, readAt: Date.now() })
    const deduped = items.filter((h, i, a) => a.findIndex(x => x.url === h.url) === i).slice(0, 200)
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(deduped, null, 2))
  } catch (_) {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify([{ url, title: url, readAt: Date.now() }], null, 2))
  }
  layoutViewer()
  updateMenu()
}

function closeViewer() {
  if (!viewer.active) return
  viewer.active = false
  layoutViewer()
  updateMenu()
  // 主动暂停所有媒体播放，再停止加载释放资源
  if (viewer.content) {
    try {
      viewer.content.webContents.executeJavaScript(
        `(function(){
          document.querySelectorAll('video,audio').forEach(function(m){
            try { m.pause(); m.currentTime = 0; } catch(e){}
          });
        })()`,
        true
      )
    } catch (_) {}
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
    height: 680,
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
  theme: config.theme || "dark",
  readerFontSize: config.readerFontSize || 16,
  readerLineHeight: config.readerLineHeight || 1.8,
}))
ipcMain.handle("settings:save", (_e, cfg) => {
  config.autoRefresh = !!cfg.autoRefresh
  config.intervalMinutes = Math.max(1, Math.min(1440, Number(cfg.intervalMinutes) || 10))
  config.viewerInApp = cfg.viewerInApp !== false
  config.theme = cfg.theme === "light" ? "light" : "dark"
  config.readerFontSize = Math.max(12, Math.min(22, Number(cfg.readerFontSize) || 16))
  config.readerLineHeight = Math.max(1.4, Math.min(2.4, Number(cfg.readerLineHeight) || 1.8))
  saveConfig()
  setupRefreshTimer()
  // 应用主题变更到主窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.executeJavaScript(`
        document.documentElement.classList.${config.theme === "light" ? "remove" : "add"}("dark");
      `, true)
    } catch (e) {}
  }
  return true
})
// 数据导出：书签 + 历史 + 设置（含自定义 RSS 源）→ JSON 备份文件
ipcMain.handle("settings:export", async () => {
  try {
    const stamp = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const fname = `NND-backup-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`
    const dialogParent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined
    const result = await dialog.showSaveDialog(dialogParent, {
      title: "导出 NND 数据",
      defaultPath: path.join(app.getPath("downloads"), fname),
      filters: [{ name: "NND 备份文件", extensions: ["json"] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    let bookmarks = []
    let history = []
    try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8")) } catch (_) {}
    try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) } catch (_) {}
    const payload = {
      app: APP_NAME,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      bookmarks,
      history,
      settings: {
        theme: config.theme,
        readerFontSize: config.readerFontSize,
        readerLineHeight: config.readerLineHeight,
        rssFeeds: Array.isArray(config.rssFeeds) ? config.rssFeeds : [],
      },
    }
    fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2))
    return {
      ok: true,
      path: result.filePath,
      counts: {
        bookmarks: bookmarks.length,
        history: history.length,
        rssFeeds: payload.settings.rssFeeds.length,
      },
    }
  } catch (e) {
    console.error("导出失败:", e)
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

// 数据导入：合并书签/历史/自定义 RSS 源，覆盖阅读设置
ipcMain.handle("settings:import", async () => {
  try {
    const dialogParent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined
    const result = await dialog.showOpenDialog(dialogParent, {
      title: "导入 NND 数据",
      filters: [{ name: "NND 备份文件", extensions: ["json"] }],
      properties: ["openFile"],
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
    let payload
    try {
      payload = JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"))
    } catch (e) {
      return { ok: false, error: "文件解析失败（不是有效的 JSON）" }
    }
    if (!payload || payload.app !== APP_NAME) {
      return { ok: false, error: "不是 NND 备份文件（缺少 NND 标识）" }
    }

    // ---- 合并书签（按 url 去重，现有优先） ----
    let bookmarks = []
    try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, "utf8")) } catch (_) {}
    const bm = mergeBookmarks(bookmarks, payload.bookmarks)
    if (bm.added) fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify(bm.merged, null, 2))

    // ---- 合并历史（按 url 去重 + 按 readAt 降序 + 上限 200） ----
    let history = []
    try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) } catch (_) {}
    const ht = mergeHistory(history, payload.history)
    if (ht.added) fs.writeFileSync(HISTORY_PATH, JSON.stringify(ht.merged, null, 2))

    // ---- 合并自定义 RSS 源（按 url 去重） ----
    const importedSettings = payload.settings || {}
    const rs = mergeRssFeeds(config.rssFeeds, importedSettings.rssFeeds)
    if (rs.added) config.rssFeeds = rs.merged

    // ---- 覆盖阅读设置（备份中提供则应用） ----
    const settingsApplied = applyImportedSettings(config, importedSettings)
    saveConfig()

    // 主题变更应用到主窗口（与 settings:save 一致）
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.executeJavaScript(
          `document.documentElement.classList.${config.theme === "light" ? "remove" : "add"}("dark");`,
          true,
        ).catch(() => {})
      } catch (_) {}
    }

    return {
      ok: true,
      stats: {
        bookmarksAdded: bm.added,
        historyAdded: ht.added,
        rssFeedsAdded: rs.added,
        settingsApplied,
      },
    }
  } catch (e) {
    console.error("导入失败:", e)
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
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
      label: APP_NAME,
      submenu: [
        { label: "关于 " + APP_NAME, click: () => {
          dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "关于",
            message: APP_NAME + " (NewsNow Desktop) v" + VERSION,
            detail: APP_NAME + " (NewsNow Desktop) — 跨平台新闻聚合阅读器\n\n基于 " + ORIGINAL_PROJECT + " 改造\n· 选择订阅源\n· 定期/按需刷新\n· 内置阅读器查看新闻\n· 关闭按钮最小化到通知栏\n\nv2.0：主进程直抓架构（无子进程、无原生模块）\n\n项目主页：" + PROJECT_HOME + "\n由 TeleAgent 打包",
            buttons: ["确定"],
          })
        }},
        { type: "separator" },
        { label: "设置…", accelerator: "CmdOrCtrl+Comma", click: openSettings },
        { type: "separator" },
        { label: "退出", accelerator: "CmdOrCtrl+Q", click: quitApp },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "刷新全部 (Ctrl+R)", click: refreshAll },
        { label: "重新加载页面", accelerator: "F5", click: () => mainWindow && mainWindow.reload() },
        { type: "separator" },
        { label: "书签面板 (Ctrl+B)", click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript("window.__nndTogglePanel && window.__nndTogglePanel()", true)
          }
        }},
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
        { label: APP_NAME + " 项目主页", click: () => shell.openExternal(PROJECT_HOME) },
        { label: "致敬原项目 NewsNow", click: () => shell.openExternal(ORIGINAL_PROJECT) },
        { type: "separator" },
        { label: "检查更新…", click: () => checkForUpdates() },
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

// 单实例锁：只允许运行一个 NND 实例，第二个实例启动时聚焦已有窗口并退出
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    // 用户尝试启动第二个实例：显示已有窗口并聚焦
    showMainWindow()
  })

  app.whenReady().then(async () => {
  try {
    initDesktopStorage()
    registerAppProtocol()
    await loadDataLayer()
    console.log(APP_NAME + " v" + VERSION + " 就绪（直抓模式，无子进程）")
  } catch (e) {
    dialog.showErrorBox("启动失败", String(e && e.message || e))
    app.quit()
    return
  }
  createMainWindow()
  createTray()
  updateMenu()
  setupRefreshTimer()

  // 自动检查更新（启动后 5 秒静默检查，不打断用户）
  setTimeout(() => checkForUpdates(true), 5000)
  })
} // end of gotTheLock else block

// ---------- 自动更新 ----------
function checkForUpdates(silent) {
  if (!autoUpdater) {
    if (!silent) dialog.showMessageBox(mainWindow, { type: "info", title: "检查更新", message: "当前为开发模式，自动更新仅在安装包中生效。", buttons: ["确定"] })
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.once("update-available", (info) => {
    if (Notification) {
      new Notification({ title: APP_NAME + " 发现新版本 v" + info.version, body: "正在后台下载，完成后将提示安装…" }).show()
    }
  })
  autoUpdater.once("update-not-available", () => {
    if (!silent) dialog.showMessageBox(mainWindow, { type: "info", title: "检查更新", message: "当前已是最新版本 v" + VERSION, buttons: ["确定"] })
  })
  autoUpdater.once("update-downloaded", (info) => {
    dialog.showMessageBox(mainWindow, {
      type: "info", title: "更新已下载",
      message: "新版本 v" + info.version + " 已准备就绪",
      detail: "点击「安装并重启」立即更新，或关闭后下次启动时自动安装。",
      buttons: ["安装并重启", "稍后"],
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall()
    })
  })
  autoUpdater.once("error", (err) => {
    if (!silent) console.warn("[autoUpdater] 检查失败:", err && err.message)
  })
  autoUpdater.checkForUpdates()
}

app.on("window-all-closed", () => {
  // 不退出应用：窗口关闭时驻留托盘（macOS 行为一致）
  // 仅在用户明确选择退出（isQuiting=true）时才真正退出
  if (process.platform !== "darwin" && isQuiting) {
    app.quit()
  }
  // 非 darwin 且非退出时：什么都不做，应用驻留托盘
  // mainWindow 可能已被 destroy（如 window.close()），下次从托盘恢复时重建
})

app.on("activate", () => {
  // 从托盘恢复或 dock 点击：重新显示/创建窗口
  showMainWindow()
})
