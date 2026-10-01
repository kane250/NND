// 测试 getter：用 esbuild 打包一个 Node 测试入口
import { build } from "esbuild"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), "newsnow-test-"))
const outFile = join(tmpDir, "test.mjs")

await build({
  entryPoints: [join(__dirname, "src", "getters.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: outFile,
  define: { "process.env.NODE_ENV": '"test"' },
  // 提供 Node 兼容的全局
  alias: {
    "buffer": "buffer",
  },
  logLevel: "warning",
})

const mod = await import(outFile)
const { fetchSource } = mod

// 测试几个源
for (const id of ["zhihu", "baidu", "hackernews", "solidot"]) {
  try {
    const r = await fetchSource(id)
    console.log(`✓ ${id}: ${r.status} ${r.items.length}条 | 首条: ${r.items[0]?.title?.slice(0, 50) || "(空)"}`)
  } catch (e) {
    console.error(`✗ ${id}: ${e.message?.slice(0, 100) || e}`)
  }
}
