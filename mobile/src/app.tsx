/**
 * 移动端 NewsNow 前端入口
 * 复用原 NewsNow 的 React 前端 UI，但数据层改为直接调用本地 getter（无需后端）
 *
 * 构建方式：
 * 1. build-web.mjs 从原 NewsNow 项目构建前端静态资源
 * 2. 注入本模块作为数据层替代
 * 3. 输出到 mobile/www/ 供 Capacitor 加载
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import { sources } from "./types"
import { getSourceData, getEntireData } from "./api"
import type { NewsItem, SourceResponse, SourceID } from "./types"

// ---------- 简单的缓存与状态管理 ----------
const cacheSources = new Map<SourceID, SourceResponse>()

// ---------- 主组件 ----------
function App() {
  const [columnId, setColumnId] = useState<string>("hottest")
  const [sourceIds, setSourceIds] = useState<SourceID[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // 根据栏目获取源列表
  useEffect(() => {
    const ids = Object.entries(sources)
      .filter(([id, meta]) => {
        if (meta.disable) return false
        if (meta.redirect) return false
        if (columnId === "hottest") return meta.type === "hottest"
        if (columnId === "realtime") return meta.type === "realtime"
        return false
      })
      .map(([id]) => id)
      .slice(0, 20) // 移动端只显示前 20 个源
    setSourceIds(ids)
  }, [columnId])

  return (
    <div className="app">
      <Header
        columnId={columnId}
        onColumnChange={setColumnId}
        onRefreshAll={() => setRefreshTrigger((r) => r + 1)}
      />
      <div className="columns">
        {sourceIds.map((id) => (
          <NewsCard key={id} id={id} refreshTrigger={refreshTrigger} />
        ))}
      </div>
    </div>
  )
}

// ---------- 头部导航 ----------
function Header({ columnId, onColumnChange, onRefreshAll }: { columnId: string; onColumnChange: (id: string) => void; onRefreshAll: () => void }) {
  const columns = [
    { id: "hottest", name: "最热" },
    { id: "realtime", name: "实时" },
  ]
  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">NewsNow</span>
      </div>
      <nav className="nav">
        {columns.map((c) => (
          <button
            key={c.id}
            className={`nav-item ${columnId === c.id ? "active" : ""}`}
            onClick={() => onColumnChange(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>
      <button className="refresh-all" onClick={onRefreshAll}>
        刷新全部
      </button>
    </header>
  )
}

// ---------- 新闻源卡片 ----------
function NewsCard({ id, refreshTrigger }: { id: SourceID; refreshTrigger: number }) {
  const [data, setData] = useState<SourceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const meta = sources[id]

  const fetchData = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSourceData(id, force)
      cacheSources.set(id, res)
      setData(res)
    } catch (e: any) {
      setError(e?.message || "获取失败")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  return (
    <div className="card" style={{ borderColor: `var(--color-${meta.color}, #666)` }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-name">{meta.name}</span>
          {meta.title && <span className="card-subtitle">{meta.title}</span>}
        </div>
        <div className="card-actions">
          <button
            className={`card-refresh ${loading ? "spinning" : ""}`}
            onClick={() => fetchData(true)}
            disabled={loading}
          >
            ↻
          </button>
        </div>
      </div>
      <div className="card-body">
        {loading && !data && <div className="loading">加载中...</div>}
        {error && !data && <div className="error">{error}</div>}
        {data && data.items.length > 0 && (
          <NewsList items={data.items} type={meta.type} />
        )}
      </div>
    </div>
  )
}

// ---------- 新闻列表 ----------
function NewsList({ items, type }: { items: NewsItem[]; type?: string }) {
  return (
    <ol className="news-list">
      {items.map((item, i) => (
        <NewsListItem key={`${item.id}-${i}`} item={item} index={i} type={type} />
      ))}
    </ol>
  )
}

function NewsListItem({ item, index, type }: { item: NewsItem; index: number; type?: string }) {
  const url = item.mobileUrl || item.url
  const openNews = (e: React.MouseEvent) => {
    e.preventDefault()
    // 在 Capacitor 中用 InAppBrowser 或系统浏览器打开
    if (typeof window !== "undefined" && (window as any).capacitor?.isNativePlatform?.()) {
      // 原生平台：用系统浏览器打开
      window.open(url, "_system")
    } else {
      window.open(url, "_blank")
    }
  }

  return (
    <li className="news-item">
      {type === "hottest" && <span className="news-rank">{index + 1}</span>}
      <a href={url} onClick={openNews} className="news-link">
        <span className="news-title">{item.title}</span>
        {item.extra?.info && <span className="news-info">{item.extra.info}</span>}
      </a>
    </li>
  )
}

// ---------- 启动 ----------
const rootElement = document.getElementById("app")
if (rootElement) {
  createRoot(rootElement).render(<App />)
}
