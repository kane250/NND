"use strict"

// 数据导入合并逻辑（供 main.cjs 的 settings:import 与自动化测试共用）
// 原则：书签/历史/RSS 按 url 去重，现有数据优先，导入数据仅补充缺失项

const HISTORY_LIMIT = 200

// 合并书签：按 url 去重，现有优先
function mergeBookmarks(existing, imported) {
  const cur = Array.isArray(existing) ? existing : []
  const inc = Array.isArray(imported) ? imported.filter((b) => b && typeof b.url === "string" && b.url) : []
  const seen = new Set(cur.map((b) => b.url))
  const added = inc.filter((b) => !seen.has(b.url))
  return { merged: cur.concat(added), added: added.length }
}

// 合并历史：按 url 去重 + 按 readAt 降序 + 上限 200
function mergeHistory(existing, imported) {
  const cur = Array.isArray(existing) ? existing : []
  const inc = Array.isArray(imported) ? imported.filter((h) => h && typeof h.url === "string" && h.url) : []
  const seen = new Set(cur.map((h) => h.url))
  const added = inc.filter((h) => !seen.has(h.url))
  if (!added.length) return { merged: cur, added: 0 }
  let merged = cur.concat(added)
  merged.sort((a, b) => (b.readAt || 0) - (a.readAt || 0))
  if (merged.length > HISTORY_LIMIT) merged = merged.slice(0, HISTORY_LIMIT)
  return { merged, added: added.length }
}

// 合并自定义 RSS 源：按 url 去重，补 id/name
function mergeRssFeeds(existing, imported) {
  const cur = Array.isArray(existing) ? existing : []
  const inc = Array.isArray(imported) ? imported.filter((f) => f && typeof f.url === "string" && f.url) : []
  const seen = new Set(cur.map((f) => f.url))
  const added = inc
    .filter((f) => !seen.has(f.url))
    .map((f) => ({
      id: f.id || "rss-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      name: f.name || f.url,
      url: f.url,
    }))
  return { merged: cur.concat(added), added: added.length }
}

// 应用阅读设置（备份提供则覆盖，含范围钳制）
function applyImportedSettings(config, importedSettings) {
  const s = importedSettings || {}
  let applied = false
  if (s.theme === "dark" || s.theme === "light") {
    config.theme = s.theme
    applied = true
  }
  if (Number.isFinite(Number(s.readerFontSize))) {
    config.readerFontSize = Math.max(12, Math.min(22, Number(s.readerFontSize)))
    applied = true
  }
  if (Number.isFinite(Number(s.readerLineHeight))) {
    config.readerLineHeight = Math.max(1.4, Math.min(2.4, Number(s.readerLineHeight)))
    applied = true
  }
  return applied
}

module.exports = { mergeBookmarks, mergeHistory, mergeRssFeeds, applyImportedSettings, HISTORY_LIMIT }
