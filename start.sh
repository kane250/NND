#!/usr/bin/env bash
# NewsNow Desktop v2.0 - Linux/macOS 启动脚本
# 依赖：仅需系统 electron（数据层在 Electron 主进程内运行，无需 Node.js、无原生模块）
# 如 Arch/Manjaro: sudo pacman -S electron；Ubuntu: sudo snap install electron --classic

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

# 解析 electron
ELECTRON_BIN="$(command -v electron || true)"
if [ -z "$ELECTRON_BIN" ]; then
  echo "未找到 electron，请先安装（Arch/Manjaro: sudo pacman -S electron；Ubuntu: sudo snap install electron --classic）。" >&2
  exit 1
fi

cd "$DIR"

# Wayland 自动适配
exec "$ELECTRON_BIN" "$DIR" --ozone-platform-hint=auto "$@"
