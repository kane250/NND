/**
 * 前端 API 层：替代原服务端的 /api/s 和 /api/s/entire
 * 直接在前端调用 getter + 缓存，无需后端
 */

import { sources } from "./types"
import { getCache, setCache, isCacheValid } from "./cache"
import type { SourceResponse, SourceID } from "./types"
export { sources, getCache, setCache, isCacheValid }

// 版本信息
export const Version = "1.0.0-mobile"

/**
 * 获取单个源的数据（对应原 /api/s?id=xxx）
 */
export async function getSourceData(id: SourceID, force = false): Promise<SourceResponse> {
  const meta = sources[id]
  if (!meta) throw new Error(`未知源: ${id}`)

  // 处理 redirect
  const realId = (meta.redirect || id) as SourceID
  const realMeta = sources[realId] || meta

  // 检查缓存（非强制刷新时）
  if (!force) {
    const cached = await getCache(realId)
    if (isCacheValid(cached, realMeta.interval)) {
      return {
        status: "cache",
        id,
        updatedTime: cached!.updated,
        items: cached!.items,
      }
    }
  }

  // 动态导入 getters（避免循环依赖）
  const { getters } = await import("./getters")
  const getter = getters[realId]
  if (!getter) throw new Error(`无抓取器: ${realId}`)

  // 抓取新数据
  try {
    const items = ((await getter()) || []).filter(Boolean).slice(0, 30)
    if (items.length) {
      await setCache(realId, items)
    }
    return {
      status: "success",
      id,
      updatedTime: Date.now(),
      items,
    }
  } catch (e: any) {
    // 抓取失败，返回旧缓存
    const cached = await getCache(realId)
    if (cached) {
      return {
        status: "cache",
        id,
        updatedTime: cached.updated,
        items: cached.items,
      }
    }
    throw new Error(`获取 ${id} 失败: ${e?.message || e}`)
  }
}

/**
 * 批量获取多个源的缓存数据（对应原 /api/s/entire）
 */
export async function getEntireData(ids: SourceID[]): Promise<SourceResponse[]> {
  const results: SourceResponse[] = []
  for (const id of ids) {
    const meta = sources[id]
    if (!meta) continue
    const realId = (meta.redirect || id) as SourceID
    const cached = await getCache(realId)
    if (cached) {
      results.push({
        status: "cache",
        id,
        items: cached.items,
        updatedTime:
          Date.now() - cached.updated < meta.interval
            ? Date.now()
            : cached.updated,
      })
    }
  }
  return results
}
