/**
 * 跨源搜索：对当前栏目可见源的缓存数据过滤标题
 */

import React, { useMemo, useState } from "react"
import { sources } from "../types"
import type { NewsItem } from "../types"
import { openArticle, showToast } from "../mobile-utils"

// 搜索基于内存缓存（cacheSources 由数据层 getCache 提供）
// 简化实现：从 cache 模块读取当前所有已缓存源的 items
import { getCache } from "../api"
import type { SourceID } from "../types"

interface SearchHit {
  item: NewsItem
  sourceName: string
}

export function SearchPage({ onClose, starredIds }: { onClose: () => void; starredIds: string[] }) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  const doSearch = async () => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setHits(null)
      return
    }
    setSearching(true)
    try {
      // 搜索范围：星标源优先；无星标时搜索全部源缓存
      const scope: string[] = starredIds.length ? starredIds : Object.keys(sources).filter((id) => {
        const m = (sources as any)[id]
        return !m.disable && !m.redirect
      })
      const result: SearchHit[] = []
      for (const id of scope.slice(0, starredIds.length ? 100 : 85)) {
        try {
          const cached = await getCache(id as SourceID)
          if (!cached?.items) continue
          for (const item of cached.items) {
            if ((item.title || "").toLowerCase().includes(q)) {
              const m = (sources as any)[id]
              result.push({ item, sourceName: m ? m.name + (m.title ? " " + m.title : "") : id })
            }
          }
        } catch (_) {}
      }
      setHits(result.slice(0, 100))
      if (!result.length) showToast("未找到匹配的新闻")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="search-overlay">
      <div className="search-bar">
        <input
          autoFocus
          className="search-input"
          type="search"
          placeholder="搜索已加载的新闻标题…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch()
          }}
        />
        <button className="search-go" onClick={doSearch} disabled={searching}>
          {searching ? "…" : "搜索"}
        </button>
        <button className="search-close" onClick={onClose}>
          取消
        </button>
      </div>
      <div className="search-results">
        {hits === null && <div className="empty-tip">输入关键词，在星标源（或全部源）的已缓存新闻中搜索。先浏览过的内容才会被搜索到。</div>}
        {hits !== null && hits.length === 0 && <div className="empty-tip">没有匹配结果</div>}
        {hits?.map(({ item, sourceName }, i) => (
          <div className="saves-item" key={(item.id || i) + "" + i}>
            <a
              className="saves-link"
              href={item.url}
              onClick={(e) => {
                e.preventDefault()
                openArticle({ ...item, sourceName })
              }}
            >
              <span className="saves-title">{item.title}</span>
              <span className="saves-meta">{sourceName}</span>
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
