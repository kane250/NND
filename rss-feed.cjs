"use strict"

// 自定义 RSS 源抓取（供 main.cjs 与 OPML 导入验证/测试共用）
// 简易 XML 解析，无 DOM 依赖

/**
 * 抓取并解析 RSS/Atom feed
 * @param {{url: string}} feed 订阅地址
 * @returns {Promise<Array>} items（最多 30 条），失败抛错
 */
async function fetchRssFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "NND/2.1 RSS Reader" },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const items = []
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

module.exports = { fetchRssFeed }
