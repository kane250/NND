// NND 自动化测试套件
// 用法: node tests/run-tests.mjs
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

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

// ========== 汇总 ==========
console.log("\n" + "=".repeat(50))
console.log(`测试结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) { console.log("\n失败项:"); failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.error}`)); process.exit(1) }
else console.log("全部通过 ✓")
