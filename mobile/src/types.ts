/**
 * 新闻源元数据（从 shared/sources.json 移植）
 * 以及类型定义
 */

export type SourceType = "hottest" | "realtime"
export type SourceColor = string

export interface NewsItem {
  id: string | number
  title: string
  url: string
  mobileUrl?: string
  pubDate?: number | string
  extra?: {
    hover?: string
    date?: number | string
    info?: false | string
    diff?: number
    icon?: false | string | { url: string; scale: number }
  }
}

export interface SourceMeta {
  name: string
  interval: number
  color: SourceColor
  title?: string
  desc?: string
  type?: SourceType
  column?: string
  home?: string
  disable?: boolean | string
  redirect?: string
}

export type SourceID = string

export type SourceGetter = () => Promise<NewsItem[]>

export interface SourceResponse {
  status: "success" | "cache"
  id: SourceID
  updatedTime: number
  items: NewsItem[]
}

// 导入 sources.json（构建时由 build-web.mjs 生成）
import sourcesData from "./sources-data.json"
export const sources: Record<string, SourceMeta> = sourcesData as Record<string, SourceMeta>
