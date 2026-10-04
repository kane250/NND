/**
 * 书签 / 历史页（顶部 tab 切换）
 */

import React, { useEffect, useState } from "react"
import { getBookmarks, removeBookmark, getHistory, clearHistory, type BookmarkItem, type HistoryItem } from "../storage"
import { openArticle, haptic, showToast } from "../mobile-utils"

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return "刚刚"
  if (m < 60) return m + " 分钟前"
  const h = Math.floor(m / 60)
  if (h < 24) return h + " 小时前"
  const d = Math.floor(h / 24)
  return d + " 天前"
}

export function SavesPage() {
  const [tab, setTab] = useState<"bookmarks" | "history">("bookmarks")
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    getBookmarks().then(setBookmarks)
    getHistory().then(setHistory)
  }, [])

  return (
    <div className="saves-page">
      <div className="saves-tabs">
        <button className={"saves-tab" + (tab === "bookmarks" ? " active" : "")} onClick={() => setTab("bookmarks")}>
          书签 {bookmarks.length ? `(${bookmarks.length})` : ""}
        </button>
        <button className={"saves-tab" + (tab === "history" ? " active" : "")} onClick={() => setTab("history")}>
          历史 {history.length ? `(${history.length})` : ""}
        </button>
        {tab === "history" && history.length > 0 && (
          <button
            className="saves-clear"
            onClick={async () => {
              await clearHistory()
              setHistory([])
              showToast("历史已清除")
              await haptic("medium")
            }}
          >
            清除
          </button>
        )}
      </div>

      {tab === "bookmarks" && (
        <div className="saves-list">
          {bookmarks.length === 0 && <div className="empty-tip">暂无书签。在新闻条目上点击 ⋯ 可收藏文章。</div>}
          {bookmarks.map((b) => (
            <div className="saves-item" key={b.url}>
              <a
                className="saves-link"
                href={b.url}
                onClick={(e) => {
                  e.preventDefault()
                  openArticle({ url: b.url, mobileUrl: b.url, title: b.title, id: b.url } as any)
                }}
              >
                <span className="saves-title">{b.title || b.url}</span>
                <span className="saves-meta">
                  {b.source ? b.source + " · " : ""}
                  {timeAgo(b.savedAt)}
                </span>
              </a>
              <button
                className="saves-remove"
                onClick={async () => {
                  const next = await removeBookmark(b.url)
                  setBookmarks(next)
                  showToast("已删除书签")
                  await haptic("light")
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="saves-list">
          {history.length === 0 && <div className="empty-tip">暂无阅读历史。</div>}
          {history.map((h) => (
            <div className="saves-item" key={h.url + h.readAt}>
              <a
                className="saves-link"
                href={h.url}
                onClick={(e) => {
                  e.preventDefault()
                  openArticle({ url: h.url, mobileUrl: h.url, title: h.title, id: h.url } as any)
                }}
              >
                <span className="saves-title">{h.title || h.url}</span>
                <span className="saves-meta">
                  {h.source ? h.source + " · " : ""}
                  {timeAgo(h.readAt)}
                </span>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
