/**
 * 移动端 OPML 生成/解析（与桌面版 opml.cjs 逻辑一致）
 * 导出：全部内置源（分类分组）+ 自定义 RSS 源
 * 导入：提取含 xmlUrl 的 outline，URL 规范化去重
 */

import { sources } from "./types"
import type { CustomRssFeed } from "./storage"
import { normalizeUrl } from "./storage"

const COLUMN_NAMES: Record<string, string> = {
  tech: "科技",
  china: "国内",
  world: "国际",
  finance: "财经",
  sports: "体育",
}

// XML 转义
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// XML 实体解码（数字实体 + 五种命名实体）
function decodeEntities(s: string): string {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

// 源显示名：name + title（与桌面版一致，如「36氪 热榜」）
function sourceLabel(meta: { name?: string; title?: string }): string {
  return (meta.name || "") + (meta.title ? " " + meta.title : "")
}

/**
 * 生成 OPML 2.0 文档（内置源分类分组 + 自定义源）
 */
export function generateOpml(customFeeds: CustomRssFeed[], version: string): string {
  const date = new Date().toISOString()
  const groups: Record<string, Array<[string, any]>> = {}
  const order: string[] = []
  for (const [id, meta] of Object.entries(sources)) {
    const col = (meta as any).column || "other"
    if (!groups[col]) {
      groups[col] = []
      order.push(col)
    }
    groups[col].push([id, meta])
  }

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<opml version="2.0">')
  lines.push("  <head>")
  lines.push(`    <title>NND 订阅列表</title>`)
  lines.push(`    <dateCreated>${esc(date)}</dateCreated>`)
  lines.push(`    <ownerName>NND (NewsNow Desktop) v${esc(version)}</ownerName>`)
  lines.push("    <docs>http://opml.org/spec2.opml</docs>")
  lines.push("  </head>")
  lines.push("  <body>")
  for (const col of order) {
    lines.push(`    <outline text="${esc(COLUMN_NAMES[col] || col)}">`)
    for (const [id, meta] of groups[col]) {
      const m = meta as any
      const label = sourceLabel(m) || id
      const attrs = [`text="${esc(label)}"`, `title="${esc(label)}"`]
      if (m._rss) attrs.push('type="rss"', `xmlUrl="${esc(m._rss)}"`)
      if (m.home) attrs.push(`htmlUrl="${esc(m.home)}"`)
      lines.push(`      <outline ${attrs.join(" ")}/>`)
    }
    lines.push("    </outline>")
  }
  const feeds = (customFeeds || []).filter((f) => f && f.url)
  if (feeds.length) {
    lines.push('    <outline text="自定义">')
    for (const f of feeds) {
      const label = f.name || f.url
      lines.push(`      <outline text="${esc(label)}" title="${esc(label)}" type="rss" xmlUrl="${esc(f.url)}" htmlUrl="${esc(f.url)}"/>`)
    }
    lines.push("    </outline>")
  }
  lines.push("  </body>")
  lines.push("</opml>")
  return lines.join("\n") + "\n"
}

// 从属性串提取属性值（引号两种形式，属性名大小写兼容）
function getAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
  const m = attrs.match(re)
  if (!m) return null
  return m[2] !== undefined ? m[2] : m[3]
}

export interface ParsedFeed {
  name: string
  xmlUrl: string
  htmlUrl: string
}

export interface ParseResult {
  title: string
  feeds: ParsedFeed[]
  duplicatesInFile: number
}

/**
 * 解析 OPML 文档，提取全部可订阅 feed（含 xmlUrl 的 outline）
 * @throws 结构不合法时抛错
 */
export function parseOpml(xml: string): ParseResult {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("文件为空")
  if (!/<opml[\s>]/i.test(xml)) throw new Error("不是有效的 OPML 文件（缺少 <opml> 根元素）")
  if (!/<body[\s>]/i.test(xml)) throw new Error("OPML 缺少 <body> 部分")
  const title = decodeEntities(xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")

  const feeds: ParsedFeed[] = []
  const seen = new Set<string>()
  let duplicatesInFile = 0
  const tagRe = /<outline\b([^>]*?)(\/?)>/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[1]
    const xmlUrlRaw = getAttr(attrs, "xmlUrl")
    if (!xmlUrlRaw) continue
    const xmlUrl = decodeEntities(xmlUrlRaw).trim()
    if (!/^https?:\/\//i.test(xmlUrl)) continue
    const key = normalizeUrl(xmlUrl)
    if (seen.has(key)) {
      duplicatesInFile++
      continue
    }
    seen.add(key)
    const nameRaw = getAttr(attrs, "text") || getAttr(attrs, "title") || ""
    const htmlUrlRaw = getAttr(attrs, "htmlUrl") || ""
    feeds.push({
      name: decodeEntities(nameRaw).trim() || xmlUrl,
      xmlUrl,
      htmlUrl: decodeEntities(htmlUrlRaw).trim(),
    })
  }
  return { title, feeds, duplicatesInFile }
}
