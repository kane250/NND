// NND 自动化测试套件
// 用法: node tests/run-tests.mjs
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ✗ ${name}\n    ${e.message}`) }
}

// ========== 1. 标题相似度 / 去重 ==========
function titleSimilarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const normalize = s => s.toLowerCase().replace(/\s+/g, "")
  const na = normalize(a), nb = normalize(b)
  const grams = (s, n) => { const g = new Set(); for (let i = 0; i <= s.length - n; i++) g.add(s.slice(i, i + n)); return g }
  const ga = grams(na, 2), gb = grams(nb, 2)
  if (ga.size === 0 || gb.size === 0) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  return inter / (ga.size + gb.size - inter)
}

function deduplicateItems(items) {
  if (!items || !items.length) return items
  const result = []
  for (const item of items) {
    let isDup = false
    for (const existing of result) {
      if (titleSimilarity(item.title, existing.title) > 0.8) { isDup = true; break }
    }
    if (!isDup) result.push(item)
  }
  return result
}

function estimateReadTime(text) {
  if (!text) return 1
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const words = (text.replace(/[\u4e00-\u9fa5]/g, " ").match(/[a-zA-Z]+/g) || []).length
  return Math.max(1, Math.ceil(chinese / 300 + words / 200))
}

console.log("\n=== 1. 标题相似度 / 去重 ===")
await test("完全相同标题相似度=1", () => { if (titleSimilarity("苹果发布iPhone 16", "苹果发布iPhone 16") !== 1) throw new Error("应为 1") })
await test("完全不同标题相似度=0", () => { if (titleSimilarity("苹果发布新手机", "微软更新Windows") !== 0) throw new Error("应为 0") })
await test("高度相似标题>0.8", () => { const s = titleSimilarity("苹果发布iPhone 16 Pro Max", "苹果发布 iPhone 16 Pro Max"); if (s <= 0.8) throw new Error(`相似度 ${s} 应 > 0.8`) })
await test("去重移除重复项", () => { const d = deduplicateItems([{title:"苹果发布iPhone 16",hot:100},{title:"苹果发布 iPhone 16",hot:80},{title:"微软更新Windows 11",hot:50}]); if (d.length !== 2) throw new Error(`应为 2，实际 ${d.length}`) })
await test("空数组安全处理", () => { if (deduplicateItems([]).length !== 0) throw new Error("空数组应返回空") })
await test("单元素数组不变", () => { if (deduplicateItems([{title:"测试"}]).length !== 1) throw new Error("单元素应保持 1") })

// ========== 2. 阅读时间估算 ==========
console.log("\n=== 2. 阅读时间估算 ===")
await test("空文本返回最小1分钟", () => { if (estimateReadTime("") !== 1) throw new Error("应为 1") })
await test("300中文字≈1分钟", () => { if (estimateReadTime("字".repeat(300)) !== 1) throw new Error(`应为1，实际 ${estimateReadTime("字".repeat(300))}`) })
await test("600中文字≈2分钟", () => { if (estimateReadTime("字".repeat(600)) !== 2) throw new Error(`应为2，实际 ${estimateReadTime("字".repeat(600))}`) })
await test("200英文词≈1分钟", () => { if (estimateReadTime("word ".repeat(200)) !== 1) throw new Error(`应为1`) })
await test("中英混合正确估算", () => { const t = "字".repeat(300) + " word ".repeat(200); if (estimateReadTime(t) !== 2) throw new Error(`应为2`) })

// ========== 3. RSS 解析 ==========
console.log("\n=== 3. RSS/Atom 解析 ===")
function parseRssXml(text) {
  const items = []; const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi; let m
  while ((m = itemRe.exec(text)) !== null && items.length < 30) {
    const b = m[1]
    const title = b.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || ""
    const link = b.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || b.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim() || ""
    if (title && link) items.push({ title, url: link })
  }
  return items
}
await test("RSS 2.0 解析", () => { const x = '<rss><channel><item><title>新闻一</title><link>https://example.com/1</link></item><item><title>新闻二</title><link>https://example.com/2</link></item></channel></rss>'; const i = parseRssXml(x); if (i.length !== 2 || i[0].title !== "新闻一") throw new Error("解析错误") })
await test("Atom 解析", () => { const x = '<feed><entry><title>Atom文章</title><link href="https://example.com/atom/1"/></entry></feed>'; const i = parseRssXml(x); if (i.length !== 1 || i[0].url !== "https://example.com/atom/1") throw new Error("Atom解析错误") })
await test("CDATA 解析", () => { const x = '<rss><channel><item><title><![CDATA[带CDATA的标题]]></title><link>https://example.com/cdata</link></item></channel></rss>'; const i = parseRssXml(x); if (i.length !== 1 || i[0].title !== "带CDATA的标题") throw new Error("CDATA解析错误") })
await test("空 Feed 安全处理", () => { if (parseRssXml("<rss></rss>").length !== 0) throw new Error("空feed应返回0") })
await test("最多30条限制", () => { let x = "<rss><channel>"; for (let i=0;i<50;i++) x += `<item><title>新闻${i}</title><link>https://example.com/${i}</link></item>`; x += "</channel></rss>"; if (parseRssXml(x).length !== 30) throw new Error("应限制30条") })

// ========== 4. 配置读写 ==========
console.log("\n=== 4. 配置读写 ===")
const testConfigPath = join(ROOT, ".temp", "test-config.json")
await test("默认配置合并", () => { const m = {...{autoRefresh:true,intervalMinutes:10,theme:"dark"}, ...{autoRefresh:false,intervalMinutes:5}}; if (m.autoRefresh!==false||m.theme!=="dark"||m.intervalMinutes!==5) throw new Error("合并错误") })
await test("配置写入和读取", () => { mkdirSync(join(ROOT,".temp"),{recursive:true}); writeFileSync(testConfigPath,JSON.stringify({autoRefresh:true,theme:"light",readerFontSize:18})); const l = JSON.parse(readFileSync(testConfigPath,"utf8")); if (l.theme!=="light"||l.readerFontSize!==18) throw new Error("读写不一致") })
await test("package.json 版本号格式", () => { const p = JSON.parse(readFileSync(join(ROOT,"package.json"),"utf8")); if (!/^\d+\.\d+\.\d+$/.test(p.version)) throw new Error("版本号格式错误") })
if (existsSync(testConfigPath)) unlinkSync(testConfigPath)

// ========== 5. 前端 bundle 品牌一致性 ==========
console.log("\n=== 5. 前端 bundle 品牌一致性 ===")
await test("bundle 版本号与 package.json 一致", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT,"package.json"),"utf8"))
  const bd = join(ROOT,"web","assets"); const fs2 = readdirSync(bd).filter(f=>/^index-[A-Za-z0-9-]+\.js$/.test(f))
  if (!fs2.length) throw new Error("未找到 bundle")
  const b = readFileSync(join(bd,fs2[0]),"utf8")
  if (!b.includes(`fk="${pkg.version}"`)) throw new Error(`bundle fk 应为 "${pkg.version}"`)
})
await test("bundle 不含旧品牌 ourongxing", () => {
  const bd = join(ROOT,"web","assets"); const fs2 = readdirSync(bd).filter(f=>/^index-[A-Za-z0-9-]+\.js$/.test(f))
  if (!fs2.length) return
  const b = readFileSync(join(bd,fs2[0]),"utf8")
  if (b.includes("ourongxing")) throw new Error("仍含旧品牌")
})
await test("bundle 含 NND logo", () => {
  const bd = join(ROOT,"web","assets"); const fs2 = readdirSync(bd).filter(f=>/^index-[A-Za-z0-9-]+\.js$/.test(f))
  if (!fs2.length) return
  const b = readFileSync(join(bd,fs2[0]),"utf8")
  if (!b.includes('children:"NND"')) throw new Error("未找到 NND logo")
})

// ========== 6. 内容源规整（v2.6.0） ==========
console.log("\n=== 6. 内容源规整 ===")
const sourcesData = JSON.parse(readFileSync(join(ROOT, "mobile", "src", "sources-data.json"), "utf8"))
await test("源总数为 85（去除冗余后）", () => {
  if (Object.keys(sourcesData).length !== 85) throw new Error(`实际 ${Object.keys(sourcesData).length} 个`)
})
await test("无纯 redirect 冗余条目", () => {
  // redirect 条目与其目标 name/title 必须不同（否则就是重复项）
  for (const [id, m] of Object.entries(sourcesData)) {
    if (m.redirect) {
      const t = sourcesData[m.redirect]
      if (t && m.name === t.name && (m.title || "") === (t.title || "")) {
        throw new Error(`${id} 与 ${m.redirect} 元数据完全一致，属冗余条目`)
      }
    }
  }
})
await test("分类修正生效（freebuf/nowcoder/steam 均为 tech）", () => {
  for (const id of ["freebuf", "nowcoder", "steam"]) {
    if (sourcesData[id].column !== "tech") throw new Error(`${id} 应为 tech，实际 ${sourcesData[id].column}`)
  }
})
await test("同名源组内 title 唯一", () => {
  const groups = {}
  for (const [id, m] of Object.entries(sourcesData)) {
    groups[m.name] = groups[m.name] || []
    groups[m.name].push([id, m.title || ""])
  }
  for (const [name, items] of Object.entries(groups)) {
    const titles = items.map(([, t]) => t)
    if (new Set(titles).size !== titles.length) throw new Error(`组「${name}」存在重复 title`)
  }
})
await test("数据层与 sources-data.json 一致（85 源全注册）", async () => {
  const api = await import(join(ROOT, "data-layer.mjs"))
  const ids = Object.keys(sourcesData)
  const missing = ids.filter((id) => !(id in api.sources))
  const extra = Object.keys(api.sources).filter((id) => !(id in sourcesData))
  if (missing.length) throw new Error(`数据层缺失: ${missing.join(",")}`)
  if (extra.length) throw new Error(`数据层多余: ${extra.join(",")}`)
})
await test("前端 bundle 源对象与数据层一致", () => {
  const bd = join(ROOT, "web", "assets")
  const fs2 = readdirSync(bd).filter((f) => /^index-[A-Za-z0-9-]+\.js$/.test(f))
  if (!fs2.length) return
  const b = readFileSync(join(bd, fs2[0]), "utf8")
  for (const id of Object.keys(sourcesData)) {
    if (!b.includes(`"${id}":`)) throw new Error(`bundle 缺少源 ${id}`)
  }
  for (const ghost of ["pcbeta-windows11", "github-trending-today", "qqvideo-tv-hotsearch", "douban-movie", "v2ex\"", "36kr\"", "cls\""]) {
    if (b.includes(ghost)) throw new Error(`bundle 残留废弃源: ${ghost}`)
  }
})

// ========== 7. 导入导出合并逻辑（v2.6.0） ==========
console.log("\n=== 7. 导入导出合并逻辑 ===")
const merge = createRequire(import.meta.url)(join(ROOT, "merge-data.cjs"))
await test("书签合并：现有优先、导入去重", () => {
  const cur = [{ url: "a", title: "现有" }, { url: "b", title: "现有B" }]
  const inc = [{ url: "a", title: "重复应忽略" }, { url: "c", title: "新增" }, { url: "", title: "无效" }, null]
  const r = merge.mergeBookmarks(cur, inc)
  if (r.merged.length !== 3) throw new Error(`应为 3，实际 ${r.merged.length}`)
  if (r.merged.find((x) => x.url === "a").title !== "现有") throw new Error("现有数据被覆盖")
  if (r.added !== 1) throw new Error(`新增数应为 1`)
})
await test("历史合并：按 readAt 排序且上限 200", () => {
  const cur = Array.from({ length: 150 }, (_, i) => ({ url: "u" + i, readAt: 1000 - i }))
  const inc = Array.from({ length: 100 }, (_, i) => ({ url: "v" + i, readAt: 5000 + i }))
  const r = merge.mergeHistory(cur, inc)
  if (r.merged.length !== 200) throw new Error(`应截断为 200，实际 ${r.merged.length}`)
  if (r.merged[0].url !== "v99") throw new Error("应按 readAt 降序排列")
  if (r.added !== 100) throw new Error("新增数应为 100")
})
await test("历史合并：重复 URL 忽略", () => {
  const r = merge.mergeHistory([{ url: "x", readAt: 9 }], [{ url: "x", readAt: 99 }])
  if (r.added !== 0) throw new Error("重复 url 不应计入新增")
  if (r.merged[0].readAt !== 9) throw new Error("现有历史不应被覆盖")
})
await test("RSS 合并：按 url 去重并补 id/name", () => {
  const r = merge.mergeRssFeeds([{ id: "r1", name: "A", url: "https://a.com/feed" }], [
    { id: "x", name: "B", url: "https://a.com/feed" }, // 重复
    { name: "C", url: "https://c.com/feed" },           // 无 id 应自动生成
    { url: "https://d.com/feed" },                       // 无 name 应回退为 url
  ])
  if (r.added !== 2) throw new Error(`新增应为 2，实际 ${r.added}`)
  const c = r.merged.find((f) => f.url === "https://c.com/feed")
  if (!c || !c.id || !c.id.startsWith("rss-")) throw new Error("id 应自动生成")
  const d = r.merged.find((f) => f.url === "https://d.com/feed")
  if (d.name !== d.url) throw new Error("缺失 name 应回退为 url")
})
await test("设置应用：合法值覆盖 + 范围钳制 + 非法值忽略", () => {
  const cfg = { theme: "dark", readerFontSize: 16, readerLineHeight: 1.8 }
  const applied1 = merge.applyImportedSettings(cfg, { theme: "light", readerFontSize: 999, readerLineHeight: 0.1 })
  if (!applied1 || cfg.theme !== "light") throw new Error("合法 theme 未应用")
  if (cfg.readerFontSize !== 22) throw new Error(`字号应钳制到 22，实际 ${cfg.readerFontSize}`)
  if (cfg.readerLineHeight !== 1.4) throw new Error(`行距应钳制到 1.4，实际 ${cfg.readerLineHeight}`)
  const before = { ...cfg }
  const applied2 = merge.applyImportedSettings(cfg, { theme: "blue", readerFontSize: "abc" })
  if (applied2 !== false) throw new Error("非法值不应应用")
  if (JSON.stringify(cfg) !== JSON.stringify(before)) throw new Error("非法值不应改变配置")
})

// ========== 汇总 ==========
console.log("\n" + "=".repeat(50))
console.log(`测试结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) { console.log("\n失败项:"); failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.error}`)); process.exit(1) }
else console.log("全部通过 ✓")
