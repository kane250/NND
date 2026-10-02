// 前端源配置补丁：将数据层（mobile/src/sources-data.json）的源同步到 web 前端 bundle
// 原因：web/ 是静态导出，源元数据被内联进 bundle，新增源不会自动出现
// 用法: node scripts/patch-web-sources.mjs
// 功能：
//   1. 删除数据层中已不存在的源（pcbeta/github/qqvideo 及其子源）
//   2. 注入数据层新增的源（10 个新源）
//   3. 同步「更多/更新」列表（qN）
//   4. 修复「更多」面板默认选中源（useState 指向已删源会崩溃）
//   5. 栏目列表渲染前过滤无效源（防止 ue 中不存在 ID 崩溃）
//   6. 清理临时诊断代码残留
//   7. bundle 重命名为 -v2（规避 Chromium 启发式缓存）
//   8. 生成入口 index-v2.html（规避 index.html 缓存）
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

// ---------- 1. 删除已废弃源（数据层中已不存在的源） ----------
// 旧 bundle 中残留：key:变量,"key-子源":{...} 片段
const removePatterns = [
  // pcbeta（含子源 pcbeta-windows11）
  /pcbeta:[A-Za-z$]+,"pcbeta-windows11":\{[^}]*\},?/g,
  // github（含子源 github-trending-today）
  /github:[A-Za-z$]+,"github-trending-today":\{[^}]*\},?/,
  // qqvideo（含子源 qqvideo-tv-hotsearch）
  /qqvideo:[A-Za-z$]+,"qqvideo-tv-hotsearch":\{[^}]*\},?/,
]

let removedCount = 0
for (const re of removePatterns) {
  const before = code.length
  code = code.replace(re, "")
  if (code.length !== before) {
    removedCount++
    changed = true
    console.log(`  ✓ 已删除废弃源片段（${re.source.slice(0, 40)}...）`)
  }
}
console.log(`已删除 ${removedCount} 组废弃源`)

// ---------- 2. 计算新增源（数据层有、bundle 无） ----------
// 定位源配置映射对象（含 v2ex: 的那个对象字面量）
const anchorIdx = code.indexOf("v2ex:")
if (anchorIdx === -1) {
  console.error("[错误] bundle 中未找到源配置映射对象（v2ex:）")
  process.exit(1)
}
const objStart = code.lastIndexOf("{", anchorIdx)
let depth = 0, objEnd = -1
for (let i = objStart; i < code.length; i++) {
  if (code[i] === "{") depth++
  else if (code[i] === "}") {
    depth--
    if (depth === 0) { objEnd = i; break }
  }
}
if (objEnd === -1) {
  console.error("[错误] 无法定位源配置对象边界")
  process.exit(1)
}

// 提取源配置对象中已有的源 ID（顶层 key）
const bundleSourceIds = new Set()
const objBody = code.slice(objStart + 1, objEnd)
const keyRe = /(?:^|[{,])(?:"([a-zA-Z0-9_-]+)"|([a-zA-Z0-9_-]+))(?=:)/g
let m
while ((m = keyRe.exec(objBody)) !== null) {
  bundleSourceIds.add(m[1] || m[2])
}

// 新增源 = 数据层中不在 bundle 的源
const newSources = Object.entries(sources).filter(([id]) => !bundleSourceIds.has(id))
if (newSources.length === 0) {
  console.log("  ✓ bundle 已包含全部数据层源，无需注入")
} else {
  console.log(`  发现 ${newSources.length} 个新增源: ${newSources.map(([id]) => id).join(", ")}`)
  const parts = newSources.map(([id, meta]) => {
    const fields = [
      meta.name ? `name:"${meta.name}"` : null,
      meta.title ? `title:"${meta.title}"` : null,
      meta.type ? `type:"${meta.type}"` : null,
      meta.column ? `column:"${meta.column}"` : null,
      meta.home ? `home:"${meta.home}"` : null,
      meta.color ? `color:"${meta.color}"` : null,
      meta.interval ? `interval:${meta.interval % 1000 === 0 ? meta.interval / 1000 + "e3" : meta.interval}` : null,
      meta.redirect ? `redirect:"${meta.redirect}"` : null,
      meta.disable ? `disable:"${meta.disable}"` : null,
    ].filter(Boolean)
    return `"${id}":{${fields.join(",")}}`
  })
  const inject = "," + parts.join(",")
  code = code.slice(0, objEnd) + inject + code.slice(objEnd)
  changed = true
  console.log(`  ✓ 已注入 ${parts.length} 个新源到源配置对象`)
}

// ---------- 3. 同步「更多/更新」列表（GN=qN） ----------
const qNRe = /const qN=\[([^\]]*)\]/
const qNMatch = code.match(qNRe)
if (qNMatch) {
  const oldList = qNMatch[1].split(",").map(s => s.trim().replace(/"/g, "")).filter(Boolean)
  const validOld = oldList.filter(id => id in sources)
  for (const [id] of newSources) {
    if (!validOld.includes(id)) validOld.push(id)
  }
  const newCode = `const qN=[${validOld.map(id => `"${id}"`).join(",")}]`
  if (newCode !== qNMatch[0]) {
    code = code.replace(qNRe, newCode)
    changed = true
    console.log(`  ✓ 已同步「更多」列表: ${validOld.join(", ")}`)
  } else {
    console.log("  ✓ 「更多」列表无需变更")
  }
} else {
  console.warn("  [警告] 未找到 qN 数组定义，跳过「更多」列表同步")
}

// ---------- 4. 修复「更多」面板默认选中源 ----------
// useState("github-trending-today") 指向已删除源 → 打开面板时 reading 'color' 崩溃
const oldSourceRe = /useState\("github-trending-today"\)/
if (oldSourceRe.test(code)) {
  const defaultId = newSources.length > 0 ? newSources[0][0] : "sspai"
  code = code.replace(oldSourceRe, `useState("${defaultId}")`)
  changed = true
  console.log(`  ✓ 已修复「更多」面板默认选中源: github-trending-today → ${defaultId}`)
}

// ---------- 5. 主视图列表渲染容错 ----------
// PF 组件 t.map -> NF/QC 卡片，列表中若含 ue 中不存在的 ID 会崩，渲染前过滤
const pfMapRe = /children:t\.map\(\(f,h\)=>D\.jsx\(nd\.li/
if (pfMapRe.test(code)) {
  code = code.replace(pfMapRe, "children:t.filter(f=>ue[f]).map((f,h)=>D.jsx(nd.li")
  changed = true
  console.log("  ✓ 已在栏目列表渲染前过滤无效源（ue 中不存在的 ID 跳过）")
}

if (changed) {
  writeFileSync(bundlePath, code)
  console.log(`✓ 已写入补丁: ${bundlePath}（${(code.length / 1024).toFixed(0)}KB）`)
} else {
  console.log("✓ 无需修改，bundle 已是最新")
}

// ---------- 6. 清理临时诊断代码残留 ----------
const diagRe = /window\.__ue(Keys|Len)=[^;]+;/g
if (diagRe.test(code)) {
  code = code.replace(diagRe, "")
  writeFileSync(bundlePath, code)
  console.log("  ✓ 已清理 bundle 中的临时诊断代码")
}

// ---------- 7. bundle 重命名为 -v2（规避 Chromium 缓存） ----------
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

// ---------- 8. 生成/刷新入口 index-v2.html ----------
const indexHtmlPath = join(ROOT, "web", "index.html")
const indexV2Path = join(ROOT, "web", "index-v2.html")
if (existsSync(indexHtmlPath)) {
  let html = readFileSync(indexHtmlPath, "utf8")
  const v2Ref = bundleFile.endsWith("-v2.js") ? bundleFile : bundleFile.replace(/\.js$/, "-v2.js")
  // index.html 的 script 引用也同步指向 v2 bundle（原 bundle 已被重命名）
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