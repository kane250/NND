/**
 * 首页：栏目 chips（最热/实时/科技/国内/国际/财经/体育）+ 源卡片流
 * 支持内置源与自定义 RSS 源统一渲染
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { sources } from "../types"
import { getSourceData, getCustomFeedData } from "../api"
import type { NewsItem, SourceResponse, SourceID } from "../types"
import { getStarredSources, toggleStarred, getCustomRssFeeds, addBookmark, getSourceLimitModes, setSourceLimit, type CustomRssFeed } from "../storage"
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
  onVisible,
  onSettled,
}: {
  source: CardSource
  refreshTrigger: number
  starred: boolean
  onToggleStar: (id: string) => void
  /** 进入视口时上报（用于首屏 ready 统计） */
  onVisible?: (id: string) => void
  /** 数据加载结束（成功或失败）时上报 */
  onSettled?: (id: string) => void
}) {
  const [data, setData] = useState<SourceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inView, setInView] = useState(false)
  const [limit, setLimit] = useState<number>(10)
  const cardRef = useRef<HTMLDivElement>(null)
  /** 是否已发起过请求（懒加载守卫：仅进入视口才请求） */
  const fetchedRef = useRef(false)

  // 读取该源持久化的条数模式（10 | 25）
  useEffect(() => {
    let alive = true
    getSourceLimitModes().then((modes) => {
      if (alive && modes[source.id] === 25) setLimit(25)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id])

  // 点击源标题：在 10 ↔ 25 条之间切换（与桌面端行为一致）
  const toggleLimit = useCallback(async () => {
    const next = limit === 25 ? 10 : 25
    setLimit(next)
    await haptic("light")
    showToast(`${source.name}：${next === 25 ? "显示最多 25 条" : "显示 10 条"}`)
    setSourceLimit(source.id, next)
  }, [limit, source.id, source.name])

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
        onSettled?.(source.id)
      }
    },
    [source.id, source.custom],
  )

  // 可见性检测：进入视口（提前 600px 预加载）才开始请求，优先加载可见部分
  useEffect(() => {
    const el = cardRef.current
    if (!el || typeof IntersectionObserver === "undefined") {
      // 环境不支持时直接视为可见，立即加载
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          onVisible?.(source.id)
          obs.disconnect()
        }
      },
      { rootMargin: "300px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 懒加载：进入视口才发起首次请求
  useEffect(() => {
    if (inView && !fetchedRef.current) {
      fetchedRef.current = true
      fetchData(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  // 手动刷新：只重新加载已加载过的卡片（视口外未触达的不请求）
  useEffect(() => {
    if (refreshTrigger > 0 && fetchedRef.current) {
      fetchData(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  return (
    <div ref={cardRef} className="card" style={{ borderLeftColor: starred ? "var(--accent)" : "var(--border)" }}>
      <div className="card-header">
        <div className="card-title" onClick={toggleLimit} style={{ cursor: "pointer" }} title={`点击切换显示条数（当前 ${limit} 条）`}>
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
            {data.items.slice(0, limit).map((item: NewsItem, index: number) => (
              <NewsListItem key={item.id || index} item={item} index={index} type={source.type} sourceName={source.name + (source.subtitle ? " " + source.subtitle : "")} />
            ))}
          </ul>
        </div>
      )}
      {data && (!data.items || data.items.length === 0) && <div className="loading">暂无内容</div>}
      {!data && !loading && !error && <div className="loading">滚动到此处时加载…</div>}
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
  onFirstScreenReady,
}: {
  categoryId: CategoryId
  refreshTrigger: number
  starred: string[]
  onStarredChange: (ids: string[]) => void
  onFeedsChanged?: () => void
  /** 首屏可见源全部加载完成（成功或失败）后回调一次，用于隐藏启动画面 */
  onFirstScreenReady?: () => void
}) {
  const [customFeeds, setCustomFeeds] = useState<CustomRssFeed[]>([])
  /** 已进入视口的源 id */
  const visibleIdsRef = useRef<Set<string>>(new Set())
  /** 已加载完成的源 id */
  const settledIdsRef = useRef<Set<string>>(new Set())
  const firstReadyRef = useRef(false)

  useEffect(() => {
    getCustomRssFeeds().then(setCustomFeeds)
  }, [])

  /** 首屏 ready 判定：可见源数量 > 0 且全部加载完成 → 通知（仅一次） */
  const maybeNotifyFirstReady = useCallback(() => {
    if (firstReadyRef.current) return
    const visible = visibleIdsRef.current
    if (visible.size === 0) return
    for (const id of visible) {
      if (!settledIdsRef.current.has(id)) return
    }
    firstReadyRef.current = true
    onFirstScreenReady?.()
  }, [onFirstScreenReady])

  const handleVisible = useCallback((id: string) => {
    visibleIdsRef.current.add(id)
  }, [])

  const handleSettled = useCallback(
    (id: string) => {
      visibleIdsRef.current.add(id)
      settledIdsRef.current.add(id)
      maybeNotifyFirstReady()
    },
    [maybeNotifyFirstReady],
  )

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

  // 切换分类时重置首屏判定状态（新分类重新统计）
  useEffect(() => {
    if (firstReadyRef.current) return
    visibleIdsRef.current = new Set()
    settledIdsRef.current = new Set()
  }, [categoryId])

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
          onVisible={handleVisible}
          onSettled={handleSettled}
        />
      ))}
      {cardSources.length === 0 && <div className="empty-tip">此栏目暂无源，可在「设置」中添加自定义 RSS 源</div>}
    </div>
  )
}
