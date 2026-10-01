/**
 * RSS 解析工具（从 server/utils/rss2json.ts 移植）
 * 使用 fast-xml-parser（浏览器兼容）
 */

import { XMLParser } from "fast-xml-parser"
import { myFetch } from "./fetch"

export interface RSSInfo {
  title: string
  description: string
  link: string
  items: RSSItem[]
}

export interface RSSItem {
  id: string
  title: string
  description: string
  link: string
  created?: string
}

const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  textNodeName: "$text",
  ignoreAttributes: false,
})

export async function rss2json(url: string): Promise<RSSInfo | undefined> {
  if (!/^https?:\/\/[^\s$.?#].\S*/i.test(url)) return

  const data = await myFetch(url, { responseType: "text" })

  const result = xmlParser.parse(data as string)

  let channel = result.rss && result.rss.channel ? result.rss.channel : result.feed
  if (Array.isArray(channel)) channel = channel[0]

  const rss: RSSInfo = {
    title: channel.title ?? "",
    description: channel.description ?? "",
    link:
      channel.link && channel.link.href
        ? channel.link.href
        : Array.isArray(channel.link)
          ? channel.link[0]
          : channel.link,
    items: [],
  }

  let items = channel.item || channel.entry || []
  if (items && !Array.isArray(items)) items = [items]

  for (const val of items) {
    rss.items.push({
      id: val.guid && val.guid.$text ? val.guid.$text : val.id ?? val.link,
      title: val.title && val.title.$text ? val.title.$text : val.title,
      description:
        val.summary && val.summary.$text
          ? val.summary.$text
          : val.description,
      link:
        val.link && val.link.href
          ? val.link.href
          : Array.isArray(val.link)
            ? val.link[0]
            : val.link,
      created: val.updated ?? val.pubDate ?? val.created,
    })
  }

  return rss
}
