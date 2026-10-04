/**
 * 首页：栏目 chips（最热/实时/科技/国内/国际/财经/体育）+ 源卡片流
 * 支持内置源与自定义 RSS 源统一渲染
 */

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { sources } from "../types"
import { getSourceData, getCustomFeedData } from "../api"
import type { NewsItem, SourceResponse, SourceID } from "../types"
import { getStarredSources, toggleStarred, getCustomRssFeeds, addBookmark, type CustomRssFeed } from "../storage"
import { openArticle, shareArticle, haptic, showToast } from "../mobile-utils"

// 栏目定义（id 与源元数据 column 对应）
export const CATEGORIES = [
  { id: "hottest", name: "最热", kind: "type" },
  { id: "realtime", name: "实时", kind: "type" },
  { id: "tech", name: "科技", kind: "column" },
  { id: "china", name: "国内", kind: "column" },
  { id: "world", name: "国际", kind: "column" },
  { id: "finance", name: "财经", kind: "column" },
  { id: "sports", name: "体育", kind: "column" },
] as const

export type CategoryId = (typeof CATEGORIES)[number]["id"]

// ---------- 源卡片（内置 + 自定义统一） ----------

export interface CardSource {
  id: string
  name: string
  subtitle?: string
  type?: string
  custom?: CustomRssFeed
}

export function NewsCard({
  source,
  refreshTrigger,
  starred,
  onToggleStar,
}: {
  source: CardSource
  refreshTrigger: number
  starred: boolean
  onToggleStar: (id: string) => void
}) {
  const [data, setData] = useState<SourceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const res = source.custom
          ? await getCustomFeedData(source.custom, force)
          : await getSourceData(source.id as SourceID, force)
        setData(res)
      } catch (e: any) {
        setError(e?.message || "获取失败")
      } finally {
        setLoading(false)
      }
    },
    [source.id, source.custom],
  )

  useEffect(() => {
    fetchData(refreshTrigger > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  return (
    <div className="card" style={{ borderLeftColor: starred ? "var(--accent)" : "var(--border)" }}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-name">{source.name}</span>
          {source.subtitle && <span className="card-subtitle">{source.subtitle}</span>}
        </div>
        <div className="card-actions">
          <button
            className={"card-star" + (starred ? " starred" : "")}
            title={starred ? "取消星标" : "加星标"}
            onClick={async () => {
              await haptic("light")
              onToggleStar(source.id)
            }}
          >
            {starred ? "★" : "☆"}
          </button>
          <button className={"card-refresh" + (loading ? " spinning" : "")} onClick={() => fetchData(true)}>
            ⟳
          </button>
        </div>
      </div>
      {loading && !data && <div className="loading">加载中…</div>}
      {error && !data && (
        <div className="error">
          {error}
          <button className="retry-btn" onClick={() => fetchData(true)}>
            重试
          </button>
        </div>
      )}
      {data && data.items && data.items.length > 0 && (
        <div className="card-body">
          <ul className="news-list">
            {data.items.slice(0, 15).map((item: NewsItem, index: number) => (
              <NewsListItem key={item.id || index} item={item} index={index} type={source.type} sourceName={source.name + (source.subtitle ? " " + source.subtitle : "")} />
            ))}
          </ul>
        </div>
      )}
      {data && (!data.items || data.items.length === 0) && <div className="loading">暂无内容</div>}
    </div>
  )
}

function NewsListItem({ item, index, type, sourceName }: { item: NewsItem; index: number; type?: string; sourceName: string }) {
  const [showActions, setShowActions] = useState(false)
  return (
    <li className="news-item">
      {type === "hottest" && <span className="news-rank">{index + 1}</span>}
      <a
        href={item.mobileUrl || item.url}
        className="news-link"
        onClick={(e) => {
          e.preventDefault()
          openArticle({ ...item, sourceName })
        }}
      >
        <span className="news-title">{item.title}</span>
        {item.extra?.info && <span className="news-info">{item.extra.info}</span>}
      </a>
      <button className="item-more" onClick={() => setShowActions((s) => !s)} title="更多操作">
        ⋯
      </button>
      {showActions && (
        <div className="item-actions-mask" onClick={() => setShowActions(false)} />
      )}
      {showActions && (
        <div className="item-actions">
          <button
            onClick={async () => {
              setShowActions(false)
              await shareArticle(item.title || "", item.mobileUrl || item.url || "")
            }}
          >
            分享
          </button>
          <button
            onClick={async () => {
              setShowActions(false)
              await addBookmark({ url: item.mobileUrl || item.url, title: item.title || "", source: sourceName })
              showToast("已收藏")
              await haptic("success")
            }}
          >
            收藏
          </button>
        </div>
      )}
    </li>
  )
}

// ---------- 首页 ----------

export function HomePage({
  categoryId,
  refreshTrigger,
  starred,
  onStarredChange,
  onFeedsChanged,
}: {
  categoryId: CategoryId
  refreshTrigger: number
  starred: string[]
  onStarredChange: (ids: string[]) => void
  onFeedsChanged?: () => void
}) {
  const [customFeeds, setCustomFeeds] = useState<CustomRssFeed[]>([])

  useEffect(() => {
    getCustomRssFeeds().then(setCustomFeeds)
  }, [])

  // 按栏目过滤源（分类内全量显示）
  const cardSources = useMemo<CardSource[]>(() => {
    const cat = CATEGORIES.find((c) => c.id === categoryId)
    if (!cat) return []
    const builtin: CardSource[] = Object.entries(sources)
      .filter(([, meta]) => {
        const m = meta as any
        if (m.disable) return false
        if (m.redirect) return false
        if (cat.kind === "type") return m.type === cat.id
        return m.column === cat.id
      })
      .map(([id, meta]) => {
        const m = meta as any
        return { id, name: m.name, subtitle: m.title, type: m.type }
      })
    const custom: CardSource[] = customFeeds.map((f) => ({
      id: f.id,
      name: f.name,
      subtitle: "自定义",
      custom: f,
    }))
    return builtin.concat(custom)
  }, [categoryId, customFeeds])

  return (
    <div className="columns">
      {cardSources.map((s) => (
        <NewsCard
          key={s.id}
          source={s}
          refreshTrigger={refreshTrigger}
          starred={starred.includes(s.id)}
          onToggleStar={async (id) => {
            const next = await toggleStarred(id)
            onStarredChange(next)
          }}
        />
      ))}
      {cardSources.length === 0 && <div className="empty-tip">此栏目暂无源，可在「设置」中添加自定义 RSS 源</div>}
    </div>
  )
}
