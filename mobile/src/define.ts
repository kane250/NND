/**
 * defineSource / defineRSSSource / defineRSSHubSource
 * 从 server/utils/source.ts 移植
 */

import type { NewsItem, SourceGetter } from "./types"
import { rss2json } from "./rss"
import { myFetch } from "./fetch"

export function defineSource(source: SourceGetter): SourceGetter
export function defineSource(source: Record<string, SourceGetter>): Record<string, SourceGetter>
export function defineSource(source: SourceGetter | Record<string, SourceGetter>): SourceGetter | Record<string, SourceGetter> {
  return source
}

export function defineRSSSource(url: string, option?: { hiddenDate?: boolean }): SourceGetter {
  return async () => {
    const data = await rss2json(url)
    if (!data?.items.length) throw new Error("Cannot fetch rss data")
    return data.items.map((item) => ({
      title: item.title,
      url: item.link,
      id: item.link,
      pubDate: !option?.hiddenDate ? (item.created as any) : undefined,
    }))
  }
}

export function defineRSSHubSource(
  route: string,
  RSSHubOptions?: Record<string, any>,
  sourceOption?: { hiddenDate?: boolean },
): SourceGetter {
  return async () => {
    const RSSHubBase = "https://rsshub.rssforever.com"
    const url = new URL(route, RSSHubBase)
    url.searchParams.set("format", "json")
    const opts = { sorted: true, ...RSSHubOptions }
    Object.entries(opts).forEach(([key, value]) => {
      url.searchParams.set(key, String(value))
    })
    const data: any = await myFetch(url.toString())
    return (data.items || []).map((item: any) => ({
      title: item.title,
      url: item.url,
      id: item.id ?? item.url,
      pubDate: !sourceOption?.hiddenDate ? item.date_published : undefined,
    }))
  }
}
