/**
 * 新闻源注册表：聚合所有源的 getter 函数
 * 对应原服务端的 server/getters.ts
 */

import type { SourceGetter, SourceID } from "./types"

// 导入所有源
import v2ex from "./sources/v2ex"
import zhihu from "./sources/zhihu"
import weibo from "./sources/weibo"
import zaobao from "./sources/zaobao"
import coolapk from "./sources/coolapk"
import mktnews from "./sources/mktnews"
import wallstreetcn from "./sources/wallstreetcn"
import _36kr from "./sources/_36kr"
import douyin from "./sources/douyin"
import hupu from "./sources/hupu"
import dongqiudi from "./sources/dongqiudi"
import aihot from "./sources/aihot"
import tieba from "./sources/tieba"
import toutiao from "./sources/toutiao"
import ithome from "./sources/ithome"
import thepaper from "./sources/thepaper"
import sputniknewscn from "./sources/sputniknewscn"
import cankaoxiaoxi from "./sources/cankaoxiaoxi"
import pcbeta from "./sources/pcbeta"
import cls from "./sources/cls"
import xueqiu from "./sources/xueqiu"
import gelonghui from "./sources/gelonghui"
import fastbull from "./sources/fastbull"
import solidot from "./sources/solidot"
import hackernews from "./sources/hackernews"
import producthunt from "./sources/producthunt"
import github from "./sources/github"
import bilibili from "./sources/bilibili"
import kuaishou from "./sources/kuaishou"
import kaopu from "./sources/kaopu"
import jin10 from "./sources/jin10"
import baidu from "./sources/baidu"
import nowcoder from "./sources/nowcoder"
import sspai from "./sources/sspai"
import juejin from "./sources/juejin"
import ifeng from "./sources/ifeng"
import chongbuluo from "./sources/chongbuluo"
import douban from "./sources/douban"
import steam from "./sources/steam"
import tencent from "./sources/tencent"
import freebuf from "./sources/freebuf"
import qqvideo from "./sources/qqvideo"
import iqiyi from "./sources/iqiyi"
import linuxdo from "./sources/linuxdo"
import ghxi from "./sources/ghxi"
import smzdm from "./sources/smzdm"

// 注册表：SourceID -> getter 函数（或多个子源的对象）
const sourceModules: Record<string, SourceGetter | Record<string, SourceGetter>> = {
  v2ex,
  zhihu,
  weibo,
  zaobao,
  coolapk,
  mktnews,
  wallstreetcn,
  "36kr": _36kr,
  douyin,
  hupu,
  dongqiudi,
  aihot,
  tieba,
  toutiao,
  ithome,
  thepaper,
  sputniknewscn,
  cankaoxiaoxi,
  pcbeta,
  cls,
  xueqiu,
  gelonghui,
  fastbull,
  solidot,
  hackernews,
  producthunt,
  github,
  bilibili,
  kuaishou,
  kaopu,
  jin10,
  baidu,
  nowcoder,
  sspai,
  juejin,
  ifeng,
  chongbuluo,
  douban,
  steam,
  tencent,
  freebuf,
  qqvideo,
  iqiyi,
  linuxdo,
  ghxi,
  smzdm,
}

// 构建 getters 映射表（展开子源）
export const getters: Record<string, SourceGetter> = {}

for (const [id, mod] of Object.entries(sourceModules)) {
  if (typeof mod === "function") {
    getters[id] = mod
  } else {
    // 子源对象（如 { "cls": telegraph, "cls-depth": depth, ... }）
    for (const [subId, getter] of Object.entries(mod)) {
      getters[subId] = getter as SourceGetter
    }
  }
}

/**
 * 获取指定源的新闻数据
 * 带本地缓存（按源的 interval 控制刷新间隔）
 */
export async function fetchSource(id: string): Promise<import("./types").SourceResponse> {
  const { sources, getCache, setCache, isCacheValid } = await import("./api")
  const meta = sources[id]
  if (!meta) throw new Error(`未知源: ${id}`)

  // 处理 redirect（先解析真实 ID 再找 getter）
  const realId = meta.redirect || id
  const realGetter = getters[realId] || getters[id]
  const realMeta = sources[realId] || meta
  if (!realGetter) throw new Error(`无抓取器: ${realId}`)

  // 检查缓存
  const cached = await getCache(realId)
  if (isCacheValid(cached, realMeta.interval)) {
    return {
      status: "cache",
      id,
      updatedTime: cached!.updated,
      items: cached!.items,
    }
  }

  // 抓取新数据
  try {
    const items = ((await realGetter()) || []).filter(Boolean).slice(0, 30)
    if (items.length) {
      await setCache(realId, items)
    }
    return {
      status: "success",
      id,
      updatedTime: Date.now(),
      items,
    }
  } catch (e) {
    // 抓取失败，返回旧缓存
    if (cached) {
      return {
        status: "cache",
        id,
        updatedTime: cached.updated,
        items: cached.items,
      }
    }
    throw e
  }
}
