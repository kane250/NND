/**
 * 设置页：主题切换 / 自定义 RSS 源管理 / OPML 导入导出（验证+去重）/ 关于
 */

import React, { useEffect, useRef, useState } from "react"
import { sources } from "../types"
import {
  getThemeMode,
  setThemeMode,
  getCustomRssFeeds,
  addCustomRssFeed,
  removeCustomRssFeed,
  setCustomRssFeeds,
  normalizeUrl,
  type CustomRssFeed,
  type ThemeMode,
} from "../storage"
import { generateOpml, parseOpml } from "../opml"
import { showToast, haptic } from "../mobile-utils"
import { rss2json } from "../rss"

const APP_VERSION = "3.0.0"

// ---------- 主题 ----------

function ThemeSection({ current, onChange }: { current: ThemeMode; onChange: (m: ThemeMode) => void }) {
  const options: Array<{ id: ThemeMode; name: string }> = [
    { id: "system", name: "跟随系统" },
    { id: "dark", name: "深色" },
    { id: "light", name: "浅色" },
  ]
  return (
    <div className="settings-group">
      <div className="settings-group-title">主题</div>
      <div className="segmented">
        {options.map((o) => (
          <button key={o.id} className={"seg-item" + (current === o.id ? " active" : "")} onClick={() => onChange(o.id)}>
            {o.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- 自定义 RSS 源 ----------

function RssSection({ feeds, onChanged }: { feeds: CustomRssFeed[]; onChanged: () => void }) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [adding, setAdding] = useState(false)

  const add = async () => {
    const u = url.trim()
    if (!/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(u)) {
      showToast("请输入有效的 http(s) RSS 地址")
      return
    }
    setAdding(true)
    try {
      // 与桌面版 /api/rss/add 行为一致：直接添加（抓取失败会在源卡片上显示错误）
      await addCustomRssFeed(name.trim(), u)
      setName("")
      setUrl("")
      onChanged()
      showToast("已添加自定义源")
      await haptic("success")
    } catch (e: any) {
      showToast("添加失败：" + (e?.message || ""))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="settings-group">
      <div className="settings-group-title">自定义 RSS 源（{feeds.length}）</div>
      <div className="rss-add-row">
        <input className="form-input" placeholder="名称（可选）" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="form-input"
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          autoCapitalize="none"
        />
        <button className="primary-btn" onClick={add} disabled={adding}>
          {adding ? "…" : "添加"}
        </button>
      </div>
      <div className="rss-list">
        {feeds.length === 0 && <div className="empty-tip small">暂无自定义源。添加后会出现在「首页」各栏目与「我的」中。</div>}
        {feeds.map((f) => (
          <div className="rss-item" key={f.id}>
            <div className="rss-info">
              <span className="rss-name">{f.name}</span>
              <span className="rss-url">{f.url}</span>
            </div>
            <button
              className="saves-remove"
              onClick={async () => {
                await removeCustomRssFeed(f.id)
                onChanged()
                showToast("已删除")
                await haptic("light")
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- OPML 导入导出 ----------

function OpmlSection({
  feeds,
  onChanged,
  refreshCards,
}: {
  feeds: CustomRssFeed[]
  onChanged: () => void
  refreshCards: () => void
}) {
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ---- 导出 ----
  const exportOpml = async () => {
    try {
      setBusy(true)
      const xml = generateOpml(feeds, APP_VERSION)
      const stamp = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const fname = `NND-subscriptions-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.opml`

      const cap = (globalThis as any).Capacitor
      if (cap?.isNativePlatform?.()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem")
        const { Share } = await import("@capacitor/share")
        const result = await Filesystem.writeFile({
          path: fname,
          data: xml,
          directory: Directory.Cache,
          encoding: "utf8",
        })
        await Share.share({
          title: "NND 订阅列表",
          text: "NND 订阅列表（OPML）",
          files: [result.uri],
          dialogTitle: "导出订阅",
        })
        setStatus("✓ 已导出，可通过系统分享保存")
      } else {
        // 浏览器：直接下载
        const blob = new Blob([xml], { type: "text/xml" })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = fname
        a.click()
        URL.revokeObjectURL(a.href)
        setStatus("✓ 已导出订阅列表（" + fname + "）")
      }
      await haptic("success")
    } catch (e: any) {
      if (String(e?.message || "").includes("cancel")) setStatus("已取消导出")
      else setStatus("✗ 导出失败：" + (e?.message || ""))
    } finally {
      setBusy(false)
    }
  }

  // ---- 导入（解析 → 三层去重 → 逐源真实抓取验证 → 添加） ----
  const importOpmlFile = async (file: File) => {
    setBusy(true)
    setStatus("正在读取文件…")
    try {
      const xml = await file.text()
      let parsed
      try {
        parsed = parseOpml(xml)
      } catch (e: any) {
        setStatus("✗ " + (e?.message || "OPML 解析失败"))
        return
      }
      if (!parsed.feeds.length) {
        setStatus("✗ OPML 中没有可导入的订阅")
        return
      }

      // 去重：内置源 _rss / 已有自定义源
      const builtinRss = new Set<string>()
      for (const meta of Object.values(sources) as any[]) {
        if (meta._rss) builtinRss.add(normalizeUrl(meta._rss))
      }
      const existing = new Set(feeds.map((f) => normalizeUrl(f.url)))
      let builtinDup = 0
      let existingDup = 0
      const candidates = []
      for (const f of parsed.feeds) {
        const key = normalizeUrl(f.xmlUrl)
        if (builtinRss.has(key)) { builtinDup++; continue }
        if (existing.has(key)) { existingDup++; continue }
        candidates.push(f)
      }

      // 逐源验证（并发 5，单源 12s 超时，能解析出条目才算有效）
      const valid: CustomRssFeed[] = []
      const invalid: Array<{ name: string; error: string }> = []
      let done = 0
      let cursor = 0
      const worker = async () => {
        while (cursor < candidates.length) {
          const f = candidates[cursor++]
          done++
          setStatus(`正在验证订阅源（${done}/${candidates.length}）… ${f.name.slice(0, 18)}`)
          try {
            const data = await Promise.race([
              rss2json(f.xmlUrl),
              new Promise((_, rej) => setTimeout(() => rej(new Error("超时")), 12000)),
            ])
            if (data?.items?.length) valid.push({ id: "", name: f.name, url: f.xmlUrl })
            else invalid.push({ name: f.name, error: "未解析出内容" })
          } catch (e: any) {
            invalid.push({ name: f.name, error: e?.message || "验证失败" })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, worker))

      // 添加（逐个走 addCustomRssFeed 的去重兜底）
      const currentFeeds = await getCustomRssFeeds()
      let imported = 0
      const nextFeeds = [...currentFeeds]
      for (const v of valid) {
        if (nextFeeds.some((f) => normalizeUrl(f.url) === normalizeUrl(v.url))) { existingDup++; continue }
        nextFeeds.push({ id: "rss-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8), name: v.name, url: v.url })
        imported++
      }
      if (imported) await setCustomRssFeeds(nextFeeds)

      const parts = [`新增 ${imported}`]
      if (builtinDup) parts.push(`内置重复 ${builtinDup}`)
      if (existingDup) parts.push(`已有重复 ${existingDup}`)
      if (parsed.duplicatesInFile) parts.push(`文件内重复 ${parsed.duplicatesInFile}`)
      if (invalid.length) parts.push(`验证失败 ${invalid.length}`)
      setStatus(`✓ OPML 导入完成（共 ${parsed.feeds.length} 项）：` + parts.join("，") + (invalid.length ? `\n失败：${invalid.slice(0, 3).map((i) => i.name).join("；")}` : ""))
      if (imported) {
        onChanged()
        refreshCards()
        await haptic("success")
      }
    } catch (e: any) {
      setStatus("✗ 导入失败：" + (e?.message || ""))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-group">
      <div className="settings-group-title">订阅列表（OPML）</div>
      <div className="settings-desc">
        导出：全部内置源（分类分组）+ 自定义源，可导入其他 RSS 阅读器；导入：自动验证源有效性并三层去重（与桌面版互通）。
      </div>
      <div className="opml-btn-row">
        <button className="normal-btn" onClick={exportOpml} disabled={busy}>
          导出订阅…
        </button>
        <button className="normal-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          导入订阅…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".opml,.xml,text/xml,application/xml,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importOpmlFile(f)
            e.target.value = ""
          }}
        />
      </div>
      {status && <div className="opml-status">{status}</div>}
    </div>
  )
}

// ---------- 设置页 ----------

export function SettingsPage({
  theme,
  onThemeChange,
  refreshCards,
}: {
  theme: ThemeMode
  onThemeChange: (m: ThemeMode) => void
  refreshCards: () => void
}) {
  const [feeds, setFeeds] = useState<CustomRssFeed[]>([])
  const reloadFeeds = () => {
    getCustomRssFeeds().then(setFeeds)
  }
  useEffect(() => {
    reloadFeeds()
  }, [])

  return (
    <div className="settings-page">
      <ThemeSection current={theme} onChange={onThemeChange} />
      <RssSection feeds={feeds} onChanged={reloadFeeds} />
      <OpmlSection feeds={feeds} onChanged={reloadFeeds} refreshCards={refreshCards} />
      <div className="settings-group">
        <div className="settings-group-title">关于</div>
        <div className="about-box">
          <div className="about-name">NND (NewsNow Desktop)</div>
          <div className="about-version">移动版 v{APP_VERSION}</div>
          <div className="about-desc">
            跨平台新闻聚合阅读器，内置 {Object.keys(sources).length} 个源。
            <br />
            基于 NewsNow（ourongxing）改造，致敬原项目。
          </div>
          <div className="about-links">
            <a href="https://github.com/kane250/NND" target="_blank" rel="noreferrer">
              项目主页
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
