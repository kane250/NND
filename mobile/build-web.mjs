#!/usr/bin/env node
/**
 * 构建移动端 Web 资源
 * 用 esbuild 把 TypeScript/React 源码打包为单个 JS 文件
 * 输出到 mobile/www/ 供 Capacitor 加载
 */

import { build, context } from "esbuild"
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(__dirname, "src")
const OUT_DIR = join(__dirname, "www")

// 确保输出目录存在
mkdirSync(OUT_DIR, { recursive: true })

// 复制静态资源（图标等）
const staticAssets = ["pwa-192x192.png", "pwa-512x512.png", "apple-touch-icon.png"]
const desktopPublicDir = join(__dirname, "..", "app", "public")
for (const asset of staticAssets) {
  const src = join(desktopPublicDir, asset)
  if (existsSync(src)) {
    copyFileSync(src, join(OUT_DIR, asset))
    console.log(`✓ 复制 ${asset}`)
  }
}

// 构建 JS
async function main() {
  const isWatch = process.argv.includes("--watch")
  const ctx = await context({
    entryPoints: [join(SRC_DIR, "app.tsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020", "safari14"],
    outfile: join(OUT_DIR, "app.js"),
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    loader: { ".json": "json" },
    // 标记 Node 专有模块为外部（避免打包错误）
    external: [],
    logLevel: "info",
  })

  if (isWatch) {
    await ctx.watch()
    console.log("✓ 监听模式已启动")
  } else {
    await ctx.rebuild()
    await ctx.dispose()
    console.log("✓ 构建完成")
  }

  // 复制 index.html（修改脚本路径为打包后的 app.js）
  const html = readFileSync(join(SRC_DIR, "index.html"), "utf8")
  writeFileSync(join(OUT_DIR, "index.html"), html)
  console.log("✓ index.html 已输出")
}

main().catch((e) => {
  console.error("构建失败:", e)
  process.exit(1)
})
