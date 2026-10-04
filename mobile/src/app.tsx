/**
 * NND 移动端 v3.0 —— 主框架
 * 页面结构：底部导航（首页 / 我的 / 书签 / 设置）+ 顶部栏目 chips + 搜索
 * 数据层：直接调用本地 getter / rss2json（无需后端）
 */

import React, { useState, useEffect, useCallback } from "react"
import { createRoot } from "react-dom/client"
import { getThemeMode, setThemeMode, getStarredSources, type ThemeMode } from "./storage"
import { setStatusBar, showToast } from "./mobile-utils"
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
