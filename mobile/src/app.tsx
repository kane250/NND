/**
 * NND 移动端 v3.0 —— 主框架
 * 页面结构：底部导航（首页 / 我的 / 书签 / 设置）+ 顶部栏目 chips + 搜索
 * 数据层：直接调用本地 getter / rss2json（无需后端）
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import { getThemeMode, setThemeMode, getStarredSources, type ThemeMode } from "./storage"
import { setStatusBar, showToast, hideSplash } from "./mobile-utils"
import { HomePage, CATEGORIES, type CategoryId } from "./components/HomePage"
import { MinePage } from "./components/MinePage"
import { SavesPage } from "./components/SavesPage"
import { SearchPage } from "./components/SearchPage"
import { SettingsPage } from "./components/SettingsPage"

type TabId = "home" | "mine" | "saves" | "settings"

const TABS: Array<{ id: TabId; name: string; icon: string }> = [
  { id: "home", name: "首页", icon: "🏠" },
  { id: "mine", name: "我的", icon: "★" },
  { id: "saves", name: "书签", icon: "🔖" },
  { id: "settings", name: "设置", icon: "⚙" },
]

// ---------- 主题应用 ----------

function applyTheme(mode: ThemeMode) {
  const prefersLight = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches
  const dark = mode === "dark" || (mode === "system" && !prefersLight)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.classList.toggle("light", !dark)
  setStatusBar(dark ? "#0f0f0f" : "#f7f7f8", !dark)
}

// ---------- 主组件 ----------

function App() {
  const [tab, setTab] = useState<TabId>("home")
  const [categoryId, setCategoryId] = useState<CategoryId>("hottest")
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [starred, setStarred] = useState<string[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>("system")
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // 返回键三级导航所需的最新状态引用（避免监听器闭包过期）
  const tabRef = useRef<TabId>("home")
  const showSearchRef = useRef(false)
  useEffect(() => { tabRef.current = tab }, [tab])
  useEffect(() => { showSearchRef.current = showSearch }, [showSearch])

  // 返回键逻辑：任意界面先回页首 → 回主页 → 主页确认退出
  useEffect(() => {
    let removeFn: (() => void) | null = null
    let cancelled = false
    const setup = async () => {
      const cap = (globalThis as any).Capacitor
      if (!cap?.isNativePlatform?.()) return
      try {
        const m = await import("@capacitor/app")
        const listener = await m.App.addListener("backButton", () => {
          // 1) 搜索浮层打开 → 先关闭搜索
          if (showSearchRef.current) { setShowSearch(false); return }
          // 2) 非主页：不在页首→回页首；已在页首→回主页
          if (tabRef.current !== "home") {
            if (window.scrollY > 0) { window.scrollTo({ top: 0 }); return }
            setTab("home")
            window.scrollTo({ top: 0 })
            return
          }
          // 3) 主页：不在页首→回页首；已在页首→提示确认退出
          if (window.scrollY > 0) { window.scrollTo({ top: 0 }); return }
          setShowExitConfirm(true)
        })
        if (!cancelled) removeFn = () => listener.remove()
        else listener.remove()
      } catch (_) {}
    }
    setup()
    return () => { cancelled = true; if (removeFn) removeFn() }
  }, [])

  // 确认退出：调用原生 exitApp
  const doExitApp = useCallback(async () => {
    try {
      const cap = (globalThis as any).Capacitor
      if (cap?.isNativePlatform?.()) {
        const m = await import("@capacitor/app")
        await m.App.exitApp()
        return
      }
    } catch (_) {}
    // 非原生环境兜底：关闭当前窗口/无操作
    if (typeof window !== "undefined" && window.close) window.close()
  }, [])

  // 初始化：主题 + 星标 + 系统主题跟随
  useEffect(() => {
    getThemeMode().then((m) => {
      setTheme(m)
      applyTheme(m)
    })
    getStarredSources().then(setStarred)
    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: light)") : null
    const listener = () => getThemeMode().then(applyTheme)
    mq?.addEventListener?.("change", listener)
    return () => mq?.removeEventListener?.("change", listener)
  }, [])

  // 启动画面控制：首屏数据就绪后隐藏；5 秒超时兑底（网络极慢时不卡启动画面）
  useEffect(() => {
    const timeout = setTimeout(() => hideSplash(300), 5000)
    return () => clearTimeout(timeout)
  }, [])

  const handleFirstScreenReady = useCallback(() => {
    hideSplash(250)
  }, [])

  const changeTheme = useCallback(async (m: ThemeMode) => {
    setTheme(m)
    await setThemeMode(m)
    applyTheme(m)
  }, [])

  const switchTab = (id: TabId) => {
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  const refreshAll = () => {
    setRefreshTrigger((r) => r + 1)
    showToast("已刷新全部源")
  }

  return (
    <div className="app">
      {/* 顶部 Header */}
      <header className="header">
        <div className="logo">NND</div>
        {tab === "home" && (
          <>
            <div className="category-chips">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  className={"chip" + (categoryId === c.id ? " active" : "")}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="搜索" onClick={() => setShowSearch(true)}>
                🔍
              </button>
              <button className="icon-btn" title="刷新全部" onClick={refreshAll}>
                ⟳
              </button>
            </div>
          </>
        )}
        {tab !== "home" && <div className="header-title">{TABS.find((t) => t.id === tab)?.name}</div>}
      </header>

      {/* 页面主体 */}
      <main className="main">
        {tab === "home" && (
          <HomePage
            categoryId={categoryId}
            refreshTrigger={refreshTrigger}
            starred={starred}
            onStarredChange={setStarred}
            onFirstScreenReady={handleFirstScreenReady}
          />
        )}
        {tab === "mine" && <MinePage refreshTrigger={refreshTrigger} starred={starred} onStarredChange={setStarred} />}
        {tab === "saves" && <SavesPage />}
        {tab === "settings" && (
          <SettingsPage theme={theme} onThemeChange={changeTheme} refreshCards={() => setRefreshTrigger((r) => r + 1)} />
        )}
      </main>

      {/* 搜索浮层 */}
      {showSearch && <SearchPage onClose={() => setShowSearch(false)} starredIds={starred} />}

      {/* 返回键确认退出浮层 */}
      {showExitConfirm && (
        <div className="exit-confirm-mask" onClick={() => setShowExitConfirm(false)}>
          <div className="exit-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="exit-confirm-title">确定要退出 NND 吗？</p>
            <div className="exit-confirm-btns">
              <button className="btn-cancel" onClick={() => setShowExitConfirm(false)}>取消</button>
              <button className="btn-exit" onClick={() => { setShowExitConfirm(false); doExitApp() }}>退出</button>
            </div>
          </div>
        </div>
      )}

      {/* 底部导航 */}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={"tabbar-item" + (tab === t.id ? " active" : "")} onClick={() => switchTab(t.id)}>
            <span className="tabbar-icon">{t.icon}</span>
            <span className="tabbar-name">{t.name}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// ---------- 启动 ----------

const rootElement = document.getElementById("app")
if (rootElement) {
  createRoot(rootElement).render(<App />)
}
