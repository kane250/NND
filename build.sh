#!/usr/bin/env bash
# NewsNow Desktop v2.0 - 从源码构建前端与数据层
# 产物：web/（React 前端静态资源）+ data-layer.mjs（数据层 bundle）

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo "=== NewsNow Desktop v2.0 构建 ==="

if ! command -v pnpm &>/dev/null; then
  echo "[错误] 未找到 pnpm，请先安装：npm install -g pnpm"
  exit 1
fi
if ! command -v git &>/dev/null; then
  echo "[错误] 未找到 git"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "→ 克隆 NewsNow..."
git clone --depth 1 https://github.com/newsnext/newsnow.git "$TMPDIR/newsnow"

echo "→ 安装依赖（可能需要几分钟）..."
cd "$TMPDIR/newsnow"
pnpm install

echo "→ 构建..."
pnpm build

echo "→ 复制前端产物到 $DIR/web/ ..."
rm -rf "$DIR/web"
mkdir -p "$DIR/web"
cp -r "$TMPDIR/newsnow/dist/output/public/." "$DIR/web/"

echo "→ 应用前端源配置补丁（注入新源/清理废弃源/生成入口）..."
node "$DIR/scripts/patch-web-sources.mjs" || echo "[警告] 前端补丁执行失败，请检查"

echo "→ 构建数据层 data-layer.mjs ..."
cd "$DIR"
if [ -d "mobile/node_modules" ] || npm --prefix mobile install &>/dev/null; then
  node scripts/build-data.mjs
else
  echo "[提示] mobile 依赖安装失败，数据层未重建（保留现有 data-layer.mjs）"
fi

echo ""
echo "✓ 构建完成！运行 ./start.sh (Linux/macOS) 或 start.bat (Windows) 启动。"
echo "  （v2.0 无需 setup 安装步骤，无原生模块依赖）"
