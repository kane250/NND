#!/usr/bin/env bash
# NewsNow Desktop - Linux/macOS 安装脚本
# 在 app/server 目录安装原生依赖（better-sqlite3 等平台特定模块）

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
SERVER_DIR="$DIR/app/server"

echo "=== NewsNow Desktop 依赖安装 (Linux/macOS) ==="

if [ ! -f "$SERVER_DIR/package.json" ]; then
  echo "[错误] 未找到 $SERVER_DIR/package.json"
  echo "请先运行 build.sh 构建 NewsNow，或从 Release 下载预构建的 app/ 目录。"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "[错误] 未找到 npm，请先安装 Node.js v18+"
  exit 1
fi

echo "→ 在 $SERVER_DIR 安装依赖..."
cd "$SERVER_DIR"
npm install --omit=dev --no-package-lock 2>&1 | tail -5

# 验证 better-sqlite3
if [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
  echo "✓ better-sqlite3 原生模块安装成功"
else
  echo "✗ better-sqlite3 安装失败，尝试重新编译..."
  cd node_modules/better-sqlite3 && npm run build-release 2>&1 | tail -5 || {
    echo "[错误] better-sqlite3 编译失败。请确保已安装编译工具（gcc/g++/make/python3）"
    exit 1
  }
fi

echo ""
echo "✓ 安装完成！现在可以运行 ./start.sh 启动应用。"
