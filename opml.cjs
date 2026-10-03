"use strict"

// OPML 订阅列表生成（供 settings:export-opml IPC 与自动化测试共用）
// OPML 2.0：通用订阅交换格式，可导入 Tiny Tiny RSS / Feedly / Inoreader 等阅读器

// 分类 column → 显示名（与前端一致）
const COLUMN_NAMES = {
  tech: "科技",
  china: "国内",
  world: "国际",
  finance: "财经",
  sports: "体育",
}

// XML 属性/文本转义
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// 源显示名：name + title（与前端列表显示一致，如「36氪 热榜」）
function sourceLabel(meta) {
  const t = meta.title ? " " + meta.title : ""
  return (meta.name || meta.id) + t
}

/**
 * 生成 OPML 2.0 文档
 * @param {Object} sourcesMeta  内置源元数据 { id: {name,title,column,home,_rss} }
 * @param {Array}  rssFeeds     自定义 RSS 源 [{id,name,url}]
 * @param {Object} opts         { title, generatedAt }
 * @returns {string} OPML XML
 */
function generateOpml(sourcesMeta, rssFeeds, opts) {
  const options = opts || {}
  const title = options.title || "NND 订阅列表"
  const dateCreated = options.generatedAt || new Date().toUTCString()

  // 按分类分组（保持内置源数据层顺序）
  const groups = {}
  const order = []
  for (const [id, meta] of Object.entries(sourcesMeta)) {
    const col = COLUMN_NAMES[meta.column] ? meta.column : meta.column
    if (!groups[col]) {
      groups[col] = []
      order.push(col)
    }
    groups[col].push([id, meta])
  }

  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<opml version="2.0">')
  lines.push("  <head>")
  lines.push(`    <title>${esc(title)}</title>`)
  lines.push(`    <dateCreated>${esc(dateCreated)}</dateCreated>`)
  lines.push("    <ownerName>NND (NewsNow Desktop)</ownerName>")
  lines.push("    <docs>http://opml.org/spec2.opml</docs>")
  lines.push("  </head>")
  lines.push("  <body>")

  // 内置源（分类分组）
  for (const col of order) {
    lines.push(`    <outline text="${esc(COLUMN_NAMES[col] || col)}">`)
    for (const [id, meta] of groups[col]) {
      const label = sourceLabel({ ...meta, id })
      const attrs = [`text="${esc(label)}"`, `title="${esc(label)}"`]
      if (meta._rss) attrs.push('type="rss"', `xmlUrl="${esc(meta._rss)}"`)
      if (meta.home) attrs.push(`htmlUrl="${esc(meta.home)}"`)
      lines.push(`      <outline ${attrs.join(" ")}/>`)
    }
    lines.push("    </outline>")
  }

  // 自定义 RSS 源
  const feeds = Array.isArray(rssFeeds) ? rssFeeds.filter((f) => f && f.url) : []
  if (feeds.length) {
    lines.push('    <outline text="自定义">')
    for (const f of feeds) {
      const label = f.name || f.url
      const attrs = [
        `text="${esc(label)}"`,
        `title="${esc(label)}"`,
        'type="rss"',
        `xmlUrl="${esc(f.url)}"`,
        f.url ? `htmlUrl="${esc(f.url)}"` : null,
      ].filter(Boolean)
      lines.push(`      <outline ${attrs.join(" ")}/>`)
    }
    lines.push("    </outline>")
  }

  lines.push("  </body>")
  lines.push("</opml>")
  return lines.join("\n") + "\n"
}

// ---------- OPML 解析（导入） ----------

// XML 实体解码（数字实体 + 五种命名实体）
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

// URL 规范化（重复对比用）：trim + 去尾部斜杠
function normalizeUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "")
}

// 从属性串提取指定属性值（支持 " 和 ' 两种引号，属性名大小写兼容）
function getAttr(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
  const m = attrs.match(re)
  if (!m) return null
  return m[2] !== undefined ? m[2] : m[3]
}

/**
 * 解析 OPML 文档，提取全部可订阅 feed（含 xmlUrl 的 outline 节点）
 * @param {string} xml OPML 文本
 * @returns {{ title: string, feeds: Array<{name:string, xmlUrl:string, htmlUrl:string}>, duplicatesInFile: number }}
 * @throws OPML 结构不合法时抛错
 */
function parseOpml(xml) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("文件为空")
  if (!/<opml[\s>]/i.test(xml)) throw new Error("不是有效的 OPML 文件（缺少 <opml> 根元素）")
  if (!/<body[\s>]/i.test(xml)) throw new Error("OPML 缺少 <body> 部分")
  const title = decodeEntities(xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")

  // 提取全部 <outline ...> 开标签（自闭合或带子节点），逐个解析属性
  const feeds = []
  const seen = new Set()
  let duplicatesInFile = 0
  const tagRe = /<outline\b([^>]*?)(\/?)>/gi
  let m
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[1]
    const xmlUrlRaw = getAttr(attrs, "xmlUrl")
    if (!xmlUrlRaw) continue // 分组节点 / 无订阅地址的节点跳过
    const xmlUrl = decodeEntities(xmlUrlRaw).trim()
    if (!/^https?:\/\//i.test(xmlUrl)) continue // 只接受 http(s) 订阅地址
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

module.exports = { generateOpml, parseOpml, COLUMN_NAMES, sourceLabel, esc, decodeEntities, normalizeUrl, getAttr }
