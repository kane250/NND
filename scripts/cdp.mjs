#!/usr/bin/env node
// CDP 调试工具（零依赖，Node 22+ 内置 fetch/WebSocket）
// 用于调试 Electron（--remote-debugging-port）或 Chrome/Chromium 远程调试目标
//
// 用法:
//   node scripts/cdp.mjs list-t                       列出所有 targets
//   node scripts/cdp.mjs eval <wsUrl|titleSub> '<js>'  在指定 target 执行 JS（参数为标题子串时自动匹配）
//   node scripts/cdp.mjs click <titleSub> <x> <y>     对指定 target 发送真实鼠标点击（Input.dispatchMouseEvent）
//   node scripts/cdp.mjs click-el <titleSub> <sel>    按 CSS 选择器定位元素并在其中心真实点击
//   node scripts/cdp.mjs shot <titleSub> <file>       截取指定 target 当前视口为 PNG（Page.captureScreenshot）
//   node scripts/cdp.mjs key <titleSub> <key>         发送按键（Input.dispatchKeyEvent，如 Escape/Enter/Tab）
//
// 环境变量:
//   CDP_PORT  调试端口，默认 9229
//
// 示例:
//   node scripts/cdp.mjs list-t
//   node scripts/cdp.mjs eval "NND" 'document.title'
//   node scripts/cdp.mjs click-el "NND" "a[href^='http']"
//   CDP_PORT=9222 node scripts/cdp.mjs list-t   # Android WebView (adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>)

const PORT = process.env.CDP_PORT || "9229"
const CDP = `http://127.0.0.1:${PORT}`
const cmd = process.argv[2]
const arg = (i) => process.argv[i] ?? ""

async function listTargets() {
  const res = await fetch(`${CDP}/json/list`)
  if (!res.ok) throw new Error(`CDP ${CDP} 不可达（HTTP ${res.status}）`)
  return await res.json()
}

async function connect(targetIdOrWsUrl) {
  const targets = await listTargets()
  const t = targets.find((x) => x.webSocketDebuggerUrl === targetIdOrWsUrl)
    || targets.find((x) => x.id === targetIdOrWsUrl)
    || targets.find((x) => x.type === "page" && x.title.includes(targetIdOrWsUrl))
  if (!t) throw new Error(`未找到 target: ${targetIdOrWsUrl}（现有: ${targets.map((x) => x.title).join(", ")}）`)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WebSocket 连接失败")) })
  let nextId = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise((res) => {
    const id = nextId++
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send, title: t.title, url: t.url }
}

async function evalOn(conn, expr, timeoutMs = 15000) {
  const timer = setTimeout(() => {
    for (const [, fn] of conn.pending || []) fn({ error: "timeout" })
  }, timeoutMs)
  const msg = await conn.send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true,
  })
  clearTimeout(timer)
  if (msg.error) return { error: msg.error }
  if (msg.result?.exceptionDetails) {
    return { error: msg.result.exceptionDetails.text, detail: msg.result.exceptionDetails.exception?.description }
  }
  return { value: msg.result?.result?.value }
}

async function realClick(conn, x, y) {
  await conn.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  await conn.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await conn.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
  return { clicked: true, x, y }
}

async function findTarget(titleSub) {
  const targets = await listTargets()
  const t = targets.find((x) => x.type === "page" && x.title.includes(titleSub))
  if (!t) throw new Error(`未找到标题含 "${titleSub}" 的页面 target（现有: ${targets.map((x) => `${x.type}:${x.title}`).join(", ")}）`)
  return t
}

const usage = () => console.log(`用法: node scripts/cdp.mjs <list-t|eval|click|click-el|shot|key> ...（详见文件头注释）`)

try {
  if (cmd === "list-t" || cmd === "list") {
    const targets = await listTargets()
    console.log(JSON.stringify(targets.map((t) => ({
      id: t.id, type: t.type, title: t.title, url: t.url, ws: t.webSocketDebuggerUrl,
    })), null, 2))
  } else if (cmd === "eval") {
    const target = arg(3)
    const expr = arg(4)
    if (!target || !expr) { usage(); process.exit(1) }
    const conn = await connect(target)
    const r = await evalOn(conn, expr)
    console.log(JSON.stringify(r, null, 2))
    conn.ws.close()
  } else if (cmd === "click") {
    const titleSub = arg(3)
    const x = parseInt(arg(4), 10)
    const y = parseInt(arg(5), 10)
    if (!titleSub || Number.isNaN(x) || Number.isNaN(y)) { usage(); process.exit(1) }
    const conn = await connect(titleSub)
    console.log(JSON.stringify(await realClick(conn, x, y)))
    conn.ws.close()
  } else if (cmd === "click-el") {
    const titleSub = arg(3)
    const selector = arg(4)
    if (!titleSub || !selector) { usage(); process.exit(1) }
    const conn = await connect(titleSub)
    const r = await evalOn(conn, `(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { err: "未匹配元素" };
      const rc = el.getBoundingClientRect();
      if (rc.width === 0) return { err: "元素不可见" };
      return { x: Math.round(rc.x + rc.width / 2), y: Math.round(rc.y + rc.height / 2), tag: el.tagName, text: (el.textContent||"").trim().slice(0, 30) };
    })()`)
    const p = r.value
    if (!p || p.err) { console.error(JSON.stringify(r)); process.exit(1) }
    console.log(JSON.stringify({ ...await realClick(conn, p.x, p.y), target: p.text || p.tag }))
    conn.ws.close()
  } else if (cmd === "shot") {
    const titleSub = arg(3)
    const file = arg(4)
    if (!titleSub || !file) { usage(); process.exit(1) }
    const conn = await connect(titleSub)
    const msg = await conn.send("Page.captureScreenshot", { format: "png" })
    const { writeFileSync } = await import("node:fs")
    writeFileSync(file, Buffer.from(msg.result.data, "base64"))
    console.log(JSON.stringify({ saved: file, bytes: msg.result.data.length }))
    conn.ws.close()
  } else if (cmd === "key") {
    const titleSub = arg(3)
    const key = arg(4)
    if (!titleSub || !key) { usage(); process.exit(1) }
    const conn = await connect(titleSub)
    const params = {
      type: "keyDown", key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    }
    await conn.send("Input.dispatchKeyEvent", params)
    await conn.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" })
    console.log(JSON.stringify({ key }))
    conn.ws.close()
  } else {
    usage()
  }
  process.exit(0)
} catch (e) {
  console.error("错误:", e.message)
  process.exit(1)
}