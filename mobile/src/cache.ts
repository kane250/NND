/**
 * 本地缓存层
 * - Electron 桌面主进程：用注入的 __DESKTOP_STORAGE__（文件持久化）
 * - Capacitor 原生：用 @capacitor/preferences（原生 SharedPreferences/UserDefaults）
 * - 浏览器：用 localStorage
 * 内存缓存 + 持久化，按源的 interval 控制刷新间隔
 */

import type { NewsItem, SourceID } from "./types"

export interface CacheEntry {
  id: SourceID
  items: NewsItem[]
  updated: number
}

const MEM_CACHE = new Map<SourceID, CacheEntry>()

// 持久化存储抽象
let storageGet: (key: string) => Promise<string | null> = async () => null
let storageSet: (key: string, value: string) => Promise<void> = async () => {}

// 异步初始化持久化存储
async function initStorage() {
  // Electron 桌面主进程：由 main.cjs 注入 globalThis.__DESKTOP_STORAGE__
  const desktopStorage = (globalThis as any).__DESKTOP_STORAGE__
  if (desktopStorage) {
    storageGet = desktopStorage.get
    storageSet = desktopStorage.set
    return
  }
  if (typeof window !== "undefined" && (window as any).capacitor?.isNativePlatform?.()) {
    try {
      const { Preferences } = await import("@capacitor/preferences")
      storageGet = (k: string) => Preferences.get({ key: k }).then((r: any) => r.value)
      storageSet = (k: string, v: string) => Preferences.set({ key: k, value: v })
    } catch {}
  } else if (typeof localStorage !== "undefined") {
    storageGet = async (k: string) => localStorage.getItem(k)
    storageSet = async (k: string, v: string) => localStorage.setItem(k, v)
  }
}

// 启动时初始化（不阻塞）
initStorage()

const PREFIX = "newsnow_cache_"

export async function getCache(id: SourceID): Promise<CacheEntry | undefined> {
  // 先查内存
  if (MEM_CACHE.has(id)) return MEM_CACHE.get(id)
  // 再查持久化
  try {
    const raw = await storageGet(PREFIX + id)
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry
      MEM_CACHE.set(id, entry)
      return entry
    }
  } catch {}
  return undefined
}

export async function setCache(id: SourceID, items: NewsItem[]): Promise<void> {
  const entry: CacheEntry = { id, items, updated: Date.now() }
  MEM_CACHE.set(id, entry)
  try {
    await storageSet(PREFIX + id, JSON.stringify(entry))
  } catch (e) {
    console.warn("缓存写入失败:", id, e)
  }
}

/**
 * 判断缓存是否仍有效（在刷新间隔内）
 */
export function isCacheValid(entry: CacheEntry | undefined, interval: number): boolean {
  if (!entry || !entry.items?.length) return false
  return Date.now() - entry.updated < interval
}
