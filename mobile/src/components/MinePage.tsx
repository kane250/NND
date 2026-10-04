/**
 * 我的页：星标源专属流（只显示用户订阅的源）
 */

import React, { useEffect, useState } from "react"
import { sources } from "../types"
import { getStarredSources, getCustomRssFeeds, type CustomRssFeed } from "../storage"
import { NewsCard, type CardSource } from "./HomePage"

export function MinePage({
  refreshTrigger,
  starred,
  onStarredChange,
}: {
  refreshTrigger: number
  starred: string[]
  onStarredChange: (ids: string[]) => void
}) {
  const [customFeeds, setCustomFeeds] = useState<CustomRssFeed[]>([])

  useEffect(() => {
    getCustomRssFeeds().then(setCustomFeeds)
  }, [])

  const cardSources: CardSource[] = starred.map((id) => {
    const meta = (sources as any)[id]
    if (meta) return { id, name: meta.name, subtitle: meta.title, type: meta.type }
    const feed = customFeeds.find((f) => f.id === id)
    if (feed) return { id, name: feed.name, subtitle: "自定义", custom: feed }
    return { id, name: id }
  })

  return (
    <div className="columns">
      {cardSources.length === 0 && (
        <div className="empty-tip">
          还没有订阅的源。在「首页」任意源卡片上点击 ☆ 即可订阅，订阅后源会集中显示在这里。
        </div>
      )}
      {cardSources.map((s) => (
        <NewsCard
          key={s.id}
          source={s}
          refreshTrigger={refreshTrigger}
          starred={starred.includes(s.id)}
          onToggleStar={async (id) => {
            const { toggleStarred } = await import("../storage")
            const next = await toggleStarred(id)
            onStarredChange(next)
          }}
        />
      ))}
    </div>
  )
}
