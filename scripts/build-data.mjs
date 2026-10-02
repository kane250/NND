// 桌面数据层构建（独立脚本，从 mobile/node_modules 解析 esbuild）
// 用法: node scripts/build-data.mjs [--watch]
import { createRequire } from "node:module"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const require = createRequire(join(ROOT, "mobile", "package.json"))
const esbuild = require("esbuild")

const isWatch = process.argv.includes("--watch")

if (isWatch) {
  const ctx = await esbuild.context({
    entryPoints: [join(ROOT, "mobile", "src", "api.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    outfile: join(ROOT, "data-layer.mjs"),
    loader: { ".json": "json" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "info",
    banner: { js: "const process = { env: { NODE_ENV: 'production' } };" },
  })
  await ctx.watch()
  console.log("✓ data-layer 构建监听中")
} else {
  await esbuild.build({
    entryPoints: [join(ROOT, "mobile", "src", "api.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    outfile: join(ROOT, "data-layer.mjs"),
    loader: { ".json": "json" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "info",
    banner: { js: "const process = { env: { NODE_ENV: 'production' } };" },
  })
  console.log("✓ data-layer.mjs 构建完成")
}
