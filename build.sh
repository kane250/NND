#!/usr/bin/env bash
# NewsNow Desktop - 从源码构建 NewsNow 前端+服务端
# 产物输出到 app/ 目录

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo "=== NewsNow Desktop 构建脚本 ==="
echo "此脚本会克隆 NewsNow 原项目、安装依赖、构建，并将产物复制到 app/ 目录。"
echo ""

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

echo "→ 复制产物到 $DIR/app/ ..."
rm -rf "$DIR/app"
cp -r "$TMPDIR/newsnow/dist/output" "$DIR/app"

echo ""
echo "✓ 构建完成！现在请运行 ./setup.sh (Linux/macOS) 或 setup.bat (Windows) 安装原生依赖。"
