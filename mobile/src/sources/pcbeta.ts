import type { NewsItem } from "../types"
import { myFetch } from "../fetch"
import { defineSource } from "../define"
import { XMLParser } from "fast-xml-parser"

const baseURL = "https://bbs.pcbeta.com"

/**
 * pcbeta 有反爬验证（环境检测/滑块），需要 POST 过验证。
 * 前端环境下用原生 HTTP 直接尝试 RSS；若被拦截则抛错走缓存。
 * 若持续失败，可在设置中关闭该源。
 */

function parseRSS(xmlText: string): NewsItem[] {
  const xml = new XMLParser({
    attributeNamePrefix: "",
    textNodeName: "#text",
    ignoreAttributes: false,
  })
  const result = xml.parse(xmlText)
  const items = result?.rss?.channel?.item
  const list: any[] = Array.isArray(items) ? items : items ? [items] : []
  return list
    .map((item) => ({
      id: item.link,
      title: item.title,
      url: item.link,
      pubDate: item.pubDate,
      extra: {
        hover: item.description,
      },
    }))
    .filter((item) => item.id && item.title)
}

function pcbeta(fid: number) {
  return defineSource(async () => {
    const text = await myFetch<string>(
      `${baseURL}/forum.php?mod=rss&fid=${fid}&auth=0`,
      { responseType: "text" }
    )
    const news = parseRSS(text)
    if (!news.length) throw new Error("Cannot fetch rss data (可能被反爬拦截)")
    return news
  })
}

export default defineSource({
  "pcbeta-windows11": pcbeta(563),
  "pcbeta-windows": pcbeta(521),
})
