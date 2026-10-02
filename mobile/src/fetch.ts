/**
 * 跨平台 HTTP 客户端
 * - Capacitor 原生平台：用 @capacitor/http 绕过 CORS
 * - 浏览器/Electron：用 fetch
 * 兼容原服务端 ofetch 的 query/headers/responseType 选项
 */

// 环境检测
const isCapacitorNative =
  typeof window !== "undefined" &&
  (window as any).capacitor?.isNativePlatform?.()

// Electron 桌面主进程：无 window、有 globalThis.__ELECTRON_MAIN__ 标记（main.cjs 注入）
const isElectronMain = !isCapacitorNative && typeof window === "undefined" &&
  typeof (globalThis as any).__ELECTRON_MAIN__ !== "undefined"

// Capacitor HTTP 插件（仅原生平台可用）
let capHttp: any = null
if (isCapacitorNative) {
  try {
    capHttp = (window as any).capacitor.Plugins.CapacitorHttp
  } catch {}
}

export interface FetchOptions {
  headers?: Record<string, string>
  responseType?: "json" | "text" | "arrayBuffer"
  query?: Record<string, string | number | boolean>
  timeout?: number
}

/**
 * 构建 URL（拼接 query 参数）
 */
function buildUrl(url: string, query?: Record<string, any>): string {
  if (!query) return url
  const u = new URL(url)
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v))
  })
  return u.toString()
}

/**
 * 统一的 HTTP 请求函数
 */
export async function httpGet<T = any>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const finalUrl = buildUrl(url, options?.query)
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    ...options?.headers,
  }

  if (capHttp) {
    // Capacitor 原生 HTTP：绕过 CORS
    const res = await capHttp.get({
      url: finalUrl,
      headers,
      responseType: options?.responseType === "arrayBuffer" ? "arraybuffer" : "text",
    })
    if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${finalUrl}`)
    return res.data as T
  }

  if (isElectronMain) {
    // Electron 主进程：Node fetch（无 CORS 约束，支持 getSetCookie/arrayBuffer）
    const res = await fetch(finalUrl, { method: "GET", headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${finalUrl}`)
    if (options?.responseType === "arrayBuffer") {
      return await res.arrayBuffer() as unknown as T
    }
    const text = await res.text()
    if (options?.responseType === "json") {
      try { return JSON.parse(text) as T } catch { return text as unknown as T }
    }
    try { return JSON.parse(text) as T } catch { return text as unknown as T }
  }

  // 浏览器/Electron：标准 fetch
  const res = await fetch(finalUrl, {
    method: "GET",
    headers,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${finalUrl}`)

  if (options?.responseType === "arrayBuffer") {
    return await res.arrayBuffer() as unknown as T
  }

  const text = await res.text()
  if (options?.responseType === "json") {
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }
  // 尝试自动 JSON 解析
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

/**
 * myFetch 兼容函数：模拟原服务端的 myFetch 接口
 */
export const myFetch = <T = any>(url: string, options?: FetchOptions): Promise<T> => {
  return httpGet<T>(url, options)
}

/**
 * raw 请求：返回原始响应（含 headers），用于需要读 cookie 的源
 */
export async function httpGetRaw(
  url: string,
  options?: FetchOptions
): Promise<{ data: any; headers: Record<string, string>; status: number }> {
  const finalUrl = buildUrl(url, options?.query)
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    ...options?.headers,
  }

  if (isElectronMain) {
    // Electron 主进程：Node fetch，headers.getSetCookie() 可用
    const res = await fetch(finalUrl, { method: "GET", headers })
    const text = await res.text()
    return {
      data: text,
      headers: res.headers as any,
      status: res.status,
    }
  }

  if (capHttp) {
    const res = await capHttp.get({
      url: finalUrl,
      headers,
      responseType: "text",
    })
    return { data: res.data, headers: res.headers || {}, status: res.status }
  }

  const res = await fetch(finalUrl, { method: "GET", headers })
  const text = await res.text()
  return {
    data: text,
    headers: Object.fromEntries(res.headers.entries()),
    status: res.status,
  }
}

// myFetch.raw 兼容（ofetch 风格）
;(myFetch as any).raw = async (url: string, options?: FetchOptions) => {
  if (isElectronMain) {
    // Electron 主进程：直接用 Node fetch 响应（headers.getSetCookie 原生支持）
    const finalUrl = buildUrl(url, options?.query)
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      ...options?.headers,
    }
    const res = await fetch(finalUrl, { method: "GET", headers })
    return {
      headers: res.headers,
      _data: await res.text(),
      status: res.status,
    }
  }
  const r = await httpGetRaw(url, options)
  return {
    headers: {
      getSetCookie(): string[] {
        // Capacitor 原生 headers 或浏览器 fetch
        const sc = r.headers["set-cookie"] || r.headers["Set-Cookie"] || ""
        return Array.isArray(sc) ? sc : sc ? [sc] : []
      },
      get(name: string): string | null {
        return r.headers[name.toLowerCase()] ?? r.headers[name] ?? null
      },
    },
    _data: r.data,
    status: r.status,
  }
}
