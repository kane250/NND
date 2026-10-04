/**
 * 文章打开（原生内嵌浏览器 / 系统浏览器回退）+ 历史记录 + 分享
 * 简易 Toast
 */

import { addHistory } from "./storage"
import type { NewsItem } from "./types"

// ---------- 文章打开 ----------

let BrowserPlugin: any = null
let SharePlugin: any = null
let HapticsPlugin: any = null
let StatusBarPlugin: any = null

async function loadPlugins() {
  if (BrowserPlugin !== null) return
  try {
    const cap = (globalThis as any).Capacitor
    if (cap?.isNativePlatform?.()) {
      const [browser, share, haptics, statusBar] = await Promise.all([
        import("@capacitor/browser").catch(() => null),
        import("@capacitor/share").catch(() => null),
        import("@capacitor/haptics").catch(() => null),
        import("@capacitor/status-bar").catch(() => null),
      ])
      BrowserPlugin = (browser as any)?.Browser || false
      SharePlugin = (share as any)?.Share || false
      HapticsPlugin = (haptics as any)?.Haptics || false
      StatusBarPlugin = (statusBar as any)?.StatusBar || false
    } else {
      BrowserPlugin = false
      SharePlugin = false
      HapticsPlugin = false
      StatusBarPlugin = false
    }
  } catch (_) {
    BrowserPlugin = false
  }
}

export async function haptic(style: "light" | "medium" | "success" = "light") {
  await loadPlugins()
  try {
    if (!HapticsPlugin) return
    if (style === "success") await HapticsPlugin.notification({ type: "SUCCESS" })
    else await HapticsPlugin.impact({ style: style === "medium" ? "MEDIUM" : "LIGHT" })
  } catch (_) {}
}

export async function setStatusBar(color: string, darkIcons: boolean) {
  await loadPlugins()
  try {
    if (StatusBarPlugin) {
      await StatusBarPlugin.setBackgroundColor({ color })
      await StatusBarPlugin.setStyle({ style: darkIcons ? "Light" : "Dark" })
    }
  } catch (_) {}
  try {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", color)
  } catch (_) {}
}

/**
 * 打开文章：原生内嵌浏览器优先（对齐桌面版内置阅读器），回退系统/新窗口
 * 同时记录阅读历史
 */
export async function openArticle(item: NewsItem & { sourceName?: string }) {
  const url = item.mobileUrl || item.url
  if (!url) return
  // 记录历史（不阻塞打开）
  addHistory({ url, title: item.title || "", source: item.sourceName || "" }).catch(() => {})
  await loadPlugins()
  try {
    if (BrowserPlugin) {
      await BrowserPlugin.open({ url, showTitle: true })
    } else if (typeof window !== "undefined" && (window as any).capacitor?.isNativePlatform?.()) {
      window.open(url, "_system")
    } else {
      window.open(url, "_blank")
    }
  } catch (_) {
    window.open(url, "_blank")
  }
}

/** 分享文章（标题 + 链接） */
export async function shareArticle(title: string, url: string) {
  await loadPlugins()
  try {
    if (SharePlugin && (await SharePlugin.canShare?.())?.value !== false) {
      await SharePlugin.share({ title: title || "NND 分享", text: title, url, dialogTitle: "分享到" })
      return true
    }
  } catch (_) {}
  try {
    if (navigator.share) {
      await navigator.share({ title: title || "NND 分享", text: title, url })
      return true
    }
  } catch (_) {}
  try {
    await navigator.clipboard.writeText((title ? title + "\n" : "") + url)
    showToast("已复制链接")
    return true
  } catch (_) {
    showToast("分享失败")
    return false
  }
}

// ---------- Toast ----------

let toastTimer: ReturnType<typeof setTimeout> | null = null

export function showToast(message: string, duration = 2200) {
  let el = document.getElementById("nnd-toast")
  if (!el) {
    el = document.createElement("div")
    el.id = "nnd-toast"
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.add("show")
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el?.classList.remove("show"), duration)
}
