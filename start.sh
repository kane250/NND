#!/usr/bin/env bash
# NewsNow Desktop - Linux/macOS 启动脚本
# 依赖：系统已安装 electron（如 Arch/Manjaro: sudo pacman -S electron）与 node

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

# 解析 node 可执行文件路径（运行 NewsNow 的 nitro 服务端）
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  if [ -x "/usr/bin/node" ]; then NODE_BIN="/usr/bin/node"; fi
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，请先安装 Node.js（v18+）。" >&2
  exit 1
fi
export NODE_BIN

# 解析 electron
ELECTRON_BIN="$(command -v electron || true)"
if [ -z "$ELECTRON_BIN" ]; then
  echo "未找到 electron，请先安装（Arch/Manjaro: sudo pacman -S electron；Ubuntu: sudo snap install electron --classic）。" >&2
  exit 1
fi
export ELECTRON_BIN

# 检查是否首次运行（app/server 依赖是否已安装）
if [ ! -d "$DIR/app/server/node_modules/better-sqlite3" ]; then
  echo "首次运行，正在安装依赖..."
  bash "$DIR/setup.sh" || {
    echo "依赖安装失败，请手动运行: ./setup.sh" >&2
    exit 1
  }
fi

# 固定工作目录为程序目录，确保 nitro 缓存(.data)落在程序目录内、路径稳定
cd "$DIR"

# Wayland 自动适配
exec "$ELECTRON_BIN" "$DIR" --ozone-platform-hint=auto "$@"
