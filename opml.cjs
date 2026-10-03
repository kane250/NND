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

module.exports = { generateOpml, COLUMN_NAMES, sourceLabel, esc }
