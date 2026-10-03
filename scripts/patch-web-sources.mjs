// 前端源配置补丁：将数据层（mobile/src/sources-data.json）的源完整同步到 web 前端 bundle
// 原因：web/ 是静态导出，源元数据被内联进 bundle，数据层变更不会自动反映
// 用法: node scripts/patch-web-sources.mjs
//
// 核心策略：以数据层为唯一真相，完全重建 bundle 内的源配置对象（85 个键全字面量）。
// 旧对象的变量引用形式（如 zhihu:eN）被替换后，对应变量定义若再无引用，
// 由「死变量清理」步骤统一删除。
//
// 幂等性：可重复执行；上游重建 bundle 后变量名变化也能动态解析（锚点不依赖变量名）。
import { readFileSync, writeFileSync, existsSync, renameSync, readdirSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

// 数据层源元数据（权威来源）
const sourcesDataPath = join(ROOT, "mobile", "src", "sources-data.json")
if (!existsSync(sourcesDataPath)) {
  console.error("[错误] 未找到 sources-data.json:", sourcesDataPath)
  process.exit(1)
}
const sources = JSON.parse(readFileSync(sourcesDataPath, "utf8"))
const dataIds = new Set(Object.keys(sources))

// 前端 bundle 主文件（index-*.js，排除 workbox）
const assetsDir = join(ROOT, "web", "assets")
const files = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter(f => /^index-[A-Za-z0-9-]+\.js$/.test(f))
  : []
const bundlePath = files.map(f => join(assetsDir, f)).find(p => existsSync(p))
if (!bundlePath) {
  console.error("[错误] 未找到前端 bundle（index-*.js），请先运行 build.sh")
  process.exit(1)
}

let code = readFileSync(bundlePath, "utf8")
let changed = false

// ---------- 工具函数 ----------

// 定位包含 anchor 索引处的对象字面量边界
function findObjectBounds(code, anchorIdx) {
  if (anchorIdx < 0) return null
  const objStart = code.lastIndexOf("{", anchorIdx)
  if (objStart === -1) return null
  let depth = 0
  for (let i = objStart; i < code.length; i++) {
    if (code[i] === "{") depth++
    else if (code[i] === "}") {
      depth--
      if (depth === 0) return { start: objStart, end: i }
    }
  }
  return null
}

// 平衡括号：从 start（指向 {）到匹配 }
function balancedEnd(code, start) {
  let depth = 0
  for (let i = start; i < code.length; i++) {
    if (code[i] === "{") depth++
    else if (code[i] === "}") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// 数据层元数据 → bundle 字面量（紧凑格式，数值用 e 记法）
function metaToLiteral(meta) {
  const parts = []
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined || v === false || k.startsWith("_")) continue
    if (k === "interval") {
      parts.push(`interval:${v % 100000 === 0 ? v / 100000 + "e5" : v % 1000 === 0 ? v / 1000 + "e3" : v}`)
    } else if (typeof v === "number") {
      parts.push(`${k}:${v}`)
    } else {
      parts.push(`${k}:"${v}"`)
    }
  }
  return `{${parts.join(",")}}`
}

// 解析对象字面量的顶层键（值形式：lit 字面量 / ref 变量引用）
function parseKeys(code, objStart, objEnd) {
  const keys = []
  const body = code.slice(objStart + 1, objEnd)
  const keyRe = /(?:^|,)(?:"([a-zA-Z0-9_-]+)"|([a-zA-Z0-9_$][a-zA-Z0-9_$-]*)):/g
  let m
  while ((m = keyRe.exec(body)) !== null) {
    const id = m[1] || m[2]
    const rest = body.slice(m.index + m[0].length)
    if (rest.startsWith("{")) {
      const litStart = m.index + m[0].length
      keys.push({ id, kind: "lit", litStart })
    } else {
      const refMatch = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)
      if (refMatch) keys.push({ id, kind: "ref", var: refMatch[0] })
    }
  }
  return keys
}

// ---------- 1. 定位源配置对象 ----------
// 锚点多级回退（兼容上游新 bundle / 已 patch 的旧 bundle）
//   上游 bundle: "v2ex-share":share（子源键，必存在）
//   已重建 bundle: "v2ex-share":{...}（首键字面量）
//   再回退: "zhihu-daily":（v2.4 注入键，仅用于诊断旧版）
let anchor = code.indexOf('"v2ex-share":')
if (anchor === -1) anchor = code.indexOf("v2ex:")
const srcObj = findObjectBounds(code, anchor)
if (!srcObj) {
  console.error("[错误] 无法定位源配置对象（未找到 v2ex-share 锚点）")
  process.exit(1)
}

// ---------- 2. 诊断旧对象 ----------
const oldKeys = parseKeys(code, srcObj.start, srcObj.end)
const oldIds = new Set(oldKeys.map(k => k.id))
const removedIds = [...oldIds].filter(id => !dataIds.has(id))
const addedIds = [...dataIds].filter(id => !oldIds.has(id))
console.log(`已定位源配置对象: ${oldKeys.length} 个键（数据层 ${dataIds.size} 个）`)
if (removedIds.length) console.log(`  将删除 ${removedIds.length} 个: ${removedIds.join(", ")}`)
if (addedIds.length) console.log(`  将注入 ${addedIds.length} 个: ${addedIds.join(", ")}`)

// ---------- 3. 完全重建源对象（数据层为唯一真相） ----------
const newBody = Object.entries(sources).map(([id, meta]) => `"${id}":${metaToLiteral(meta)}`).join(",")
const newObj = `{${newBody}}`
const oldObj = code.slice(srcObj.start, srcObj.end + 1)
if (oldObj !== newObj) {
  code = code.slice(0, srcObj.start) + newObj + code.slice(srcObj.end + 1)
  changed = true
  console.log(`  ✓ 源配置对象已重建: ${oldKeys.length} → ${dataIds.size} 个键`)
} else {
  console.log("  ✓ 源配置对象已是最新，无需重建")
}

// ---------- 4. 同步「更多/更新」列表（qN） ----------
const qNRe = /const qN=\[([^\]]*)\]/
const qNMatch = code.match(qNRe)
if (qNMatch) {
  const oldList = qNMatch[1].split(",").map(s => s.trim().replace(/"/g, "")).filter(Boolean)
  const validOld = oldList.filter(id => id in sources)
  for (const id of dataIds) {
    if (!validOld.includes(id)) validOld.push(id)
  }
  const newCode = `const qN=[${validOld.map(id => `"${id}"`).join(",")}]`
  if (newCode !== qNMatch[0]) {
    code = code.replace(qNRe, newCode)
    changed = true
    console.log(`  ✓ 已同步「更多」列表（${oldList.length} → ${validOld.length} 项）`)
  } else {
    console.log("  ✓ 「更多」列表无需变更")
  }
} else {
  console.warn("  [警告] 未找到 qN 数组定义，跳过「更多」列表同步")
}

// ---------- 5. 修复「更多」面板默认选中源（指向已删源会崩溃） ----------
const deletedCandidates = ["github-trending-today", "v2ex", "mktnews", "wallstreetcn", "36kr", "cls", "xueqiu", "fastbull", "bilibili", "chongbuluo", "tencent", "iqiyi", "douban-movie", "pcbeta-windows11", "qqvideo-tv-hotsearch"]
const useStateRe = new RegExp(`useState\\("(${deletedCandidates.join("|")})"\\)`)
const usm = code.match(useStateRe)
if (usm) {
  const defaultId = dataIds.has("sspai") ? "sspai" : [...dataIds][0]
  code = code.replace(useStateRe, `useState("${defaultId}")`)
  changed = true
  console.log(`  ✓ 已修复「更多」面板默认选中源: ${usm[1]} → ${defaultId}`)
}

// ---------- 6. 主视图列表渲染容错（无效源 ID 过滤） ----------
const pfMapRe = /children:t\.map\(\(f,h\)=>D\.jsx\(nd\.li/
if (pfMapRe.test(code)) {
  code = code.replace(pfMapRe, "children:t.filter(f=>ue[f]).map((f,h)=>D.jsx(nd.li")
  changed = true
  console.log("  ✓ 已在栏目列表渲染前过滤无效源（源对象中不存在的 ID 跳过）")
}

// ---------- 7. 清理 slug 映射对象中的无效键 ----------
const slugAnchor = code.indexOf('"v2ex-share":"V2EX-')
if (slugAnchor !== -1) {
  const slugObj = findObjectBounds(code, slugAnchor)
  if (slugObj) {
    const slugBody = code.slice(slugObj.start + 1, slugObj.end)
    const slugKeyRe = /"([a-zA-Z0-9_-]+)":"([^"\\]|\\.)*"/g
    const removals = []
    let m
    while ((m = slugKeyRe.exec(slugBody)) !== null) {
      if (!dataIds.has(m[1])) removals.push({ text: m[0], idx: m.index })
    }
    let slugRemoved = 0
    for (const r of [...removals].sort((a, b) => b.idx - a.idx)) {
      const absStart = slugObj.start + 1 + r.idx
      let delEnd = absStart + r.text.length
      if (code[delEnd] === ",") delEnd++
      else if (code[absStart - 1] === ",") {
        code = code.slice(0, absStart - 1) + code.slice(absStart)
        slugRemoved++
        continue
      }
      code = code.slice(0, absStart) + code.slice(delEnd)
      slugRemoved++
    }
    if (slugRemoved) {
      changed = true
      console.log(`  ✓ 已清理 slug 映射中 ${slugRemoved} 个无效键`)
    } else {
      console.log("  ✓ slug 映射无无效键")
    }
  }
}

// ---------- 8. 清理无引用的死变量定义（源元数据形状） ----------
{
  const defRe = /([A-Za-z_$][A-Za-z0-9_$]*)=\{((?:[^{}"]|"(?:[^"\\]|\\.)*")*)\}/g
  let m
  const deadDefs = []
  while ((m = defRe.exec(code)) !== null) {
    const varName = m[1]
    const body = m[2]
    // 必须像源元数据：以 redirect:" 或 name:" 开头，且含 column:" 或 color:"
    if (!/^(?:redirect:"|name:")/.test(body)) continue
    if (!/(?:column:"|color:")/.test(body)) continue
    const defStart = m.index
    const defEnd = m.index + m[0].length
    // 引用检测：将定义体替换为占位后，全 bundle 搜索 VAR 的其他出现
    const probe = code.slice(0, defStart) + "\u0000".repeat(m[0].length) + code.slice(defEnd)
    const refRe = new RegExp(`(?<![\\w$.])${varName.replace(/\$/g, "\\$")}(?![\\w$=])`)
    if (!refRe.test(probe)) {
      deadDefs.push({ varName, start: defStart, end: defEnd })
    }
  }
  let deadRemoved = 0
  for (const d of [...deadDefs].sort((a, b) => b.start - a.start)) {
    let delEnd = d.end
    if (code[delEnd] === ",") delEnd++
    else if (code[d.start - 1] === ",") {
      code = code.slice(0, d.start - 1) + code.slice(d.start)
      deadRemoved++
      console.log(`  ✓ 已删除死变量定义: ${d.varName}`)
      continue
    }
    code = code.slice(0, d.start) + code.slice(delEnd)
    deadRemoved++
    console.log(`  ✓ 已删除死变量定义: ${d.varName}`)
  }
  if (deadRemoved) {
    changed = true
    console.log(`共清理 ${deadRemoved} 个死变量定义`)
  } else {
    console.log("  ✓ 无死变量定义需要清理")
  }
}

// ---------- 9. 清理临时诊断代码残留 ----------
{
  const diagRe = /window\.__ue(Keys|Len)=[^;]+;/g
  if (diagRe.test(code)) {
    code = code.replace(diagRe, "")
    changed = true
    console.log("  ✓ 已清理 bundle 中的临时诊断代码")
  }
}

// ---------- 写回 ----------
if (changed) {
  writeFileSync(bundlePath, code)
  console.log(`✓ 已写入补丁: ${bundlePath}（${(code.length / 1024).toFixed(0)}KB）`)
} else {
  console.log("✓ 无需修改，bundle 已是最新")
}

// ---------- 10. bundle 重命名为 -v2（规避 Chromium 缓存） ----------
const bundleFile = basename(bundlePath)
if (!bundleFile.endsWith("-v2.js")) {
  const v2Name = bundleFile.replace(/\.js$/, "-v2.js")
  const v2Path = join(assetsDir, v2Name)
  if (!existsSync(v2Path)) {
    renameSync(bundlePath, v2Path)
    console.log(`  ✓ bundle 已重命名: ${bundleFile} → ${v2Name}`)
  } else {
    writeFileSync(v2Path, code)
    console.log(`  ✓ v2 bundle 已更新: ${v2Name}`)
  }
}

// ---------- 11. 生成/刷新入口 index-v2.html ----------
const indexHtmlPath = join(ROOT, "web", "index.html")
const indexV2Path = join(ROOT, "web", "index-v2.html")
if (existsSync(indexHtmlPath)) {
  let html = readFileSync(indexHtmlPath, "utf8")
  const v2Ref = bundleFile.endsWith("-v2.js") ? bundleFile : bundleFile.replace(/\.js$/, "-v2.js")
  if (/\/assets\/index-[A-Za-z0-9-]+\.js/.test(html)) {
    html = html.replace(/\/assets\/index-[A-Za-z0-9-]+\.js/, "/assets/" + v2Ref)
  }
  writeFileSync(indexV2Path, html)
  writeFileSync(indexHtmlPath, html)
  console.log(`  ✓ 入口 index-v2.html 已生成（引用 ${v2Ref}），index.html 已同步`)
} else {
  console.warn("  [警告] 未找到 web/index.html，跳过入口生成")
}

console.log("✓ 补丁完成")
