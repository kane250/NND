// 品牌定制补丁：将前端 bundle 中的原项目品牌信息替换为 NND (NewsNow Desktop)
// 修改项：版本号、GitHub 链接、作者、左上角 logo、Star 按钮、版权信息 + 致敬原项目
// 用法: node scripts/patch-branding.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const assetsDir = join(ROOT, "web", "assets")

// 找到前端 bundle（优先 v2 版本）
const files = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter(f => /^index-[A-Za-z0-9-]+\.js$/.test(f))
  : []
const bundlePath = files.map(f => join(assetsDir, f)).find(p => existsSync(p))
if (!bundlePath) {
  console.error("[错误] 未找到前端 bundle（index-*.js）")
  process.exit(1)
}

let code = readFileSync(bundlePath, "utf8")
let changes = 0

// 替换辅助函数
function replace(oldStr, newStr, desc) {
  if (code.includes(oldStr)) {
    code = code.replace(oldStr, newStr)
    changes++
    console.log(`  ✓ ${desc}`)
    return true
  }
  console.warn(`  [跳过] 未找到: ${desc}`)
  return false
}

console.log("→ 应用品牌定制补丁...")

// 1. 版本号：0.0.42 → 2.0.0
replace('fk="0.0.42"', 'fk="2.0.0"', "版本号 0.0.42 → 2.0.0")

// 2. 作者信息：ourongxing → TeleAgent (kane250)
replace(
  'dk={url:"https://github.com/ourongxing/",name:"ourongxing"}',
  'dk={url:"https://github.com/kane250/",name:"TeleAgent"}',
  "作者 ourongxing → TeleAgent (kane250)",
)

// 3. 项目主页 URL：ourongxing/newsnow → kane250/newsnow-desktop
replace(
  'hk="https://github.com/ourongxing/newsnow"',
  'hk="https://github.com/kane250/newsnow-desktop"',
  "项目主页 URL → kane250/newsnow-desktop",
)

// 4. 左上角 logo：News + Now → NND
replace(
  'children:[D.jsx("p",{children:"News"}),D.jsxs("p",{className:"mt--1",children:[D.jsx("span",{className:"color-primary-6",children:"N"}),D.jsx("span",{children:"ow"})]})]',
  'children:[D.jsx("p",{children:"NND"})]',
  "左上角 logo News+Now → NND",
)

// 5. Star badge 链接
replace(
  'href:"https://github.com/ourongxing/newsnow",children:D.jsx("img",{alt:"GitHub stars badge",src:"https://img.shields.io/github/stars/ourongxing/newsnow?logo=github&style=flat&labelColor=%235e3c40&color=%23614447"})',
  'href:"https://github.com/kane250/newsnow-desktop",children:D.jsx("img",{alt:"GitHub stars badge",src:"https://img.shields.io/github/stars/kane250/newsnow-desktop?logo=github&style=flat&labelColor=%235e3c40&color=%23614447"})',
  "Star badge 链接 → kane250/newsnow-desktop",
)

// 6. Fork badge 链接
replace(
  'href:"https://github.com/ourongxing/newsnow/fork",children:D.jsx("img",{alt:"GitHub forks badge",src:"https://img.shields.io/github/forks/ourongxing/newsnow?logo=github&style=flat&labelColor=%235e3c40&color=%23614447"})',
  'href:"https://github.com/kane250/newsnow-desktop/fork",children:D.jsx("img",{alt:"GitHub forks badge",src:"https://img.shields.io/github/forks/kane250/newsnow-desktop?logo=github&style=flat&labelColor=%235e3c40&color=%23614447"})',
  "Fork badge 链接 → kane250/newsnow-desktop",
)

// 7. 版权信息 + 致敬原项目
replace(
  'children:[D.jsx("span",{children:"NewsNow © 2024 By "}),D.jsx("a",{href:jx.url,target:"_blank",children:jx.name})]',
  'children:[D.jsx("span",{children:"NND © 2026 By "}),D.jsx("a",{href:jx.url,target:"_blank",children:jx.name}),D.jsx("span",{children:" · 致敬原项目 "}),D.jsx("a",{href:"https://github.com/newsnext/newsnow",target:"_blank",children:"NewsNow"})]',
  "版权信息 → NND © 2026 By TeleAgent + 致敬原项目",
)

// 8. 页面标题前缀：NewsNow | → NND |
replace(
  'x2(`NewsNow | ${Wv[t].name}`)',
  'x2(`NND | ${Wv[t].name}`)',
  "页面标题前缀 NewsNow → NND",
)

if (changes > 0) {
  writeFileSync(bundlePath, code)
  console.log(`✓ 品牌定制完成: ${changes} 处修改, ${basename(bundlePath)}（${(code.length / 1024).toFixed(0)}KB）`)
} else {
  console.log("✓ 无需修改，品牌信息已是最新")
}