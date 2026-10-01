import type { NewsItem } from "../types"
import { myFetch } from "../fetch"
import { defineSource } from "../define"
import { XMLParser } from "fast-xml-parser"

function getText(value: any): string {
  if (!value) return ""
  if (typeof value === "string") return value
  return value["#text"] || value.$text || ""
}

export default defineSource(async () => {
  const url = "https://www.freebuf.com/feed"
  const xmlText = await myFetch<string>(url, { responseType: "text" })

  if (!xmlText) throw new Error("Cannot fetch freebuf feed")

  const xml = new XMLParser({
    attributeNamePrefix: "",
    textNodeName: "#text",
    ignoreAttributes: false,
  })
  const result = xml.parse(xmlText)
  const items = result?.rss?.channel?.item
  const list: any[] = Array.isArray(items) ? items : items ? [items] : []

  const news = list.map<NewsItem>((item) => {
    const link = getText(item.link)
    return {
      id: getText(item.guid) || link,
      title: getText(item.title),
      url: link,
      pubDate: item.pubDate,
      extra: {
        hover: getText(item.description),
      },
    }
  }).filter((item) => item.id && item.title && item.url)

  if (!news.length) throw new Error("Cannot fetch freebuf feed")
  return news
})
