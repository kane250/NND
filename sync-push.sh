#!/usr/bin/env bash
# 同时推送代码到 GitHub (origin) 和 Gitee (gitee)
# 用法: ./sync-push.sh [commit message]

set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$DIR"

MSG="${1:-auto sync}"

# 如果有未提交的变更，先提交
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "$MSG"
fi

echo "→ 推送到 GitHub (origin)..."
git push origin main 2>&1 || echo "[警告] GitHub 推送失败"

echo "→ 推送到 Gitee (gitee)..."
git push gitee main 2>&1 || echo "[警告] Gitee 推送失败"

# 同步所有 tag
echo "→ 同步 Tag..."
git push origin --tags 2>&1 || true
git push gitee --tags 2>&1 || true

echo ""
echo "✓ 双平台同步完成"
echo "  GitHub: https://github.com/kane250/NND"
echo "  Gitee:  https://gitee.com/kane25000/NND"
