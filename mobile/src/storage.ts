/**
 * 移动端本地持久化工具
 * - Capacitor 原生：@capacitor/preferences（SharedPreferences / UserDefaults）
 * - 浏览器/预览：localStorage
 * 统一 async get/set + JSON 封装
 */

const PREFIX = "nnd:"

let mode: "capacitor" | "localStorage" | "memory" = "memory"
let Preferences: any = null

async function initOnce() {
  if (mode !== "memory") return
  const cap = (globalThis as any).Capacitor
  if (cap?.isNativePlatform?.()) {
    try {
      Preferences = (await import("@capacitor/preferences")).Preferences
      await Preferences.configure()
      mode = "capacitor"
      return
    } catch (_) {
      // 回退
    }
  }
  if (typeof localStorage !== "undefined") {
    mode = "localStorage"
  }
}

export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  try {
    await initOnce()
    let raw: string | null = null
    if (mode === "capacitor") {
      raw = (await Preferences.get({ key: PREFIX + key })).value
    } else if (mode === "localStorage") {
      raw = localStorage.getItem(PREFIX + key)
    }
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch (_) {
    return fallback
  }
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  try {
    await initOnce()
    const raw = JSON.stringify(value)
    if (mode === "capacitor") {
      await Preferences.set({ key: PREFIX + key, value: raw })
    } else if (mode === "localStorage") {
      localStorage.setItem(PREFIX + key, raw)
    }
  } catch (e) {
    console.warn("storageSet 失败:", key, e)
  }
}

// ---------- 类型定义 ----------

export interface BookmarkItem {
  url: string
  title: string
  source?: string
  savedAt: number
}

export interface HistoryItem {
  url: string
  title: string
  source?: string
  readAt: number
}

export interface CustomRssFeed {
  id: string
  name: string
  url: string
}

export type ThemeMode = "system" | "dark" | "light"

// ---------- 具体数据操作（与桌面版语义一致） ----------

const HISTORY_LIMIT = 200

export async function getBookmarks(): Promise<BookmarkItem[]> {
  return storageGet<BookmarkItem[]>("bookmarks", [])
}

export async function addBookmark(item: { url: string; title: string; source?: string }): Promise<BookmarkItem[]> {
  const list = await getBookmarks()
  const next = list.filter((b) => b.url !== item.url)
  next.unshift({ ...item, savedAt: Date.now() })
  await storageSet("bookmarks", next)
  return next
}

export async function removeBookmark(url: string): Promise<BookmarkItem[]> {
  const list = (await getBookmarks()).filter((b) => b.url !== url)
  await storageSet("bookmarks", list)
  return list
}

export async function getHistory(): Promise<HistoryItem[]> {
  return storageGet<HistoryItem[]>("history", [])
}

export async function addHistory(item: { url: string; title: string; source?: string }): Promise<HistoryItem[]> {
  const list = await getHistory()
  const next = list.filter((h) => h.url !== item.url)
  next.unshift({ ...item, readAt: Date.now() })
  const trimmed = next.slice(0, HISTORY_LIMIT)
  await storageSet("history", trimmed)
  return trimmed
}

export async function clearHistory(): Promise<void> {
  await storageSet("history", [])
}

/** 首次启动默认关注的源（每个分类一个）：仅初始化一次，之后以用户手动修改为准 */
const DEFAULT_STARRED = [
  "zhihu", // 最热 - 知乎
  "ithome", // 实时 - IT之家
  "hackernews", // 科技 - Hacker News
  "thepaper", // 国内 - 澎湃新闻
  "zaobao", // 国际 - 联合早报
  "wallstreetcn-news", // 财经 - 华尔街见闻
  "hupu", // 体育 - 虎扑
]

export async function getStarredSources(): Promise<string[]> {
  const inited = await storageGet<boolean>("starred_initialized", false)
  if (!inited) {
    // 首次启动：写入默认关注并标记已初始化，之后不再自动覆盖
    await storageSet("starred", [...DEFAULT_STARRED])
    await storageSet("starred_initialized", true)
    return [...DEFAULT_STARRED]
  }
  return storageGet<string[]>("starred", [])
}

export async function toggleStarred(id: string): Promise<string[]> {
  const list = await getStarredSources()
  const next = list.includes(id) ? list.filter((x) => x !== id) : list.concat(id)
  await storageSet("starred", next)
  return next
}

export async function getCustomRssFeeds(): Promise<CustomRssFeed[]> {
  const list = await storageGet<CustomRssFeed[]>("customRss", [])
  return (Array.isArray(list) ? list : []).map(normalizeFeed)
}


function normalizeFeed(f: CustomRssFeed): CustomRssFeed {
  return { id: f?.id || "", name: f?.name || f?.url || "", url: f?.url || "" }
}

export async function addCustomRssFeed(name: string, url: string): Promise<CustomRssFeed[]> {
  const list = await getCustomRssFeeds()
  if (list.some((f) => normalizeUrl(f.url) === normalizeUrl(url))) return list
  const id = "rss-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  list.push({ id, name: name || url, url })
  await storageSet("customRss", list)
  return list
}

export async function removeCustomRssFeed(id: string): Promise<CustomRssFeed[]> {
  const list = (await getCustomRssFeeds()).filter((f) => f.id !== id)
  await storageSet("customRss", list)
  return list
}

export async function setCustomRssFeeds(feeds: CustomRssFeed[]): Promise<void> {
  await storageSet("customRss", feeds)
}

// ---------- 源条数模式（点击源标题在 10 ↔ 25 条之间切换，与桌面端一致） ----------

/** 获取全部源的条数模式（key: 源 id，value: 10 | 25） */
export async function getSourceLimitModes(): Promise<Record<string, number>> {
  const modes = await storageGet<Record<string, number>>("src_limit_modes", {})
  return (modes && typeof modes === "object") ? modes : {}
}

/** 设置单个源的条数模式并返回更新后的全量模式 */
export async function setSourceLimit(id: string, limit: number): Promise<Record<string, number>> {
  const modes = await getSourceLimitModes()
  modes[id] = limit === 25 ? 25 : 10
  await storageSet("src_limit_modes", modes)
  return modes
}

export async function getThemeMode(): Promise<ThemeMode> {
  return storageGet<ThemeMode>("theme", "system")
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await storageSet("theme", mode)
}

// ---------- URL 规范化（与桌面版 opml.cjs 一致） ----------

export function normalizeUrl(u: string): string {
  return String(u || "").trim().replace(/\/+$/, "")
}
