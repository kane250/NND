"use strict"

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog, protocol, Tray, nativeImage } = require("electron")
const path = require("node:path")
const fs = require("node:fs")

const APP_DIR = __dirname
const DATA_LAYER = path.join(APP_DIR, "data-layer.mjs")
const WEB_DIR = path.join(APP_DIR, "web")
const VIEWER_HTML = path.join(APP_DIR, "viewer.html")
const VIEWER_PRELOAD = path.join(APP_DIR, "viewer-preload.cjs")
const SETTINGS_HTML = path.join(APP_DIR, "settings.html")
const SETTINGS_PRELOAD = path.join(APP_DIR, "settings-preload.cjs")

const VERSION = "2.0.1"
const BUILD_DATE = "2026-10-02"
const APP_NAME = "NND"
const APP_FULL_NAME = "NewsNow Desktop"
const PROJECT_HOME = "https://github.com/kane250/newsnow-desktop"
const ORIGINAL_PROJECT = "https://github.com/newsnext/newsnow"

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
    // dom-ready: 尽早注入禁止自动播放（在页面脚本执行前）
    viewer.content.webContents.on("dom-ready", () => {
      if (!viewer.content) return
      try {
        viewer.content.webContents.insertCSS(AD_BLOCK_CSS)
        viewer.content.webContents.executeJavaScript(NO_AUToplay_JS, true)
        console.log("[viewer] 广告拦截 + 禁止自动播放脚本已注入")
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
})

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
