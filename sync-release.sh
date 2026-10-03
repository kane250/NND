#!/usr/bin/env bash
# 同步 GitHub Release 到 Gitee
# 策略：<100MB 文件直接上传 Gitee；>100MB 文件在 Release 描述中放 GitHub 下载链接
# 用法: ./sync-release.sh <tag> [gitee_token]
# 示例: ./sync-release.sh v2.4.0
set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$DIR"

TAG="${1:?用法: ./sync-release.sh <tag> [gitee_token]}"
GITEE_TOKEN="${2:-72f57effb791521aa223da7348376b1d}"
GITEE_OWNER="kane25000"
GITEE_REPO="NND"
GH_OWNER="kane250"
GH_REPO="NND"
TEMP_DIR="$DIR/.temp/gitee-release"

echo "=== 同步 GitHub Release $TAG → Gitee ==="

# 1. 下载 GitHub Release 产物
echo "→ 下载 GitHub $TAG 产物..."
mkdir -p "$TEMP_DIR"
rm -f "$TEMP_DIR"/*
gh release download "$TAG" --dir "$TEMP_DIR" --clobber --repo "$GH_OWNER/$GH_REPO" 2>/dev/null || {
  echo "[错误] GitHub Release $TAG 下载失败"
  exit 1
}
FILE_COUNT=$(ls "$TEMP_DIR" | wc -l)
echo "  ✓ 下载 $FILE_COUNT 个文件"

# 2. 构建下载表格（区分 Gitee 上传 vs GitHub 链接）
echo "→ 构建下载表格..."
DOWNLOAD_TABLE=""
UPLOAD_FILES=""
for file in "$TEMP_DIR"/*; do
  name=$(basename "$file")
  size=$(stat -c%s "$file")
  size_mb=$((size / 1048576))
  if [ $size -gt 104857600 ]; then
    # 大文件：GitHub 下载链接
    DL_URL="https://github.com/$GH_OWNER/$GH_REPO/releases/download/$TAG/$name"
    # 判断平台
    case "$name" in
      *-win-*) PLATFORM="🪟 Windows" ;;
      *.AppImage) PLATFORM="🐧 Linux AppImage" ;;
      *-linux-*.tar.gz) PLATFORM="🐧 Linux tar.gz" ;;
      *) PLATFORM="📦 $name" ;;
    esac
    DOWNLOAD_TABLE="${DOWNLOAD_TABLE}| ${PLATFORM} | ${name} | ${size_mb}MB | [GitHub 下载](${DL_URL}) |\n"
  else
    # 小文件：上传到 Gitee
    case "$name" in
      *.deb) PLATFORM="🐧 Linux deb" ;;
      *.apk) PLATFORM="📱 Android" ;;
      *) PLATFORM="📦 $name" ;;
    esac
    DOWNLOAD_TABLE="${DOWNLOAD_TABLE}| ${PLATFORM} | ${name} | ${size_mb}MB | ↓ 下方附件 |\n"
    UPLOAD_FILES="${UPLOAD_FILES} ${file}"
  fi
done

# 3. 清理旧版 Release 附件（仓库附件配额 1GB，只保留最新版直传附件）
echo "→ 清理旧版 Release 附件（只保留最新版直传，释放配额）..."
OLD_RELEASES=$(curl -s "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases" -H "Authorization: token $GITEE_TOKEN" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.tag_name!=='$TAG').map(r=>r.id).join(' '))}catch(e){console.log('')}})" 2>/dev/null)
CLEANED=0
for rid in $OLD_RELEASES; do
  ATTACH_IDS=$(curl -s "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases/$rid/attach_files" -H "Authorization: token $GITEE_TOKEN" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).map(f=>f.id).join(' '))}catch(e){console.log('')}})" 2>/dev/null)
  for fid in $ATTACH_IDS; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
      "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases/$rid/attach_files/$fid" \
      -H "Authorization: token $GITEE_TOKEN" --max-time 30)
    if [ "$CODE" = "200" ] || [ "$CODE" = "204" ]; then CLEANED=$((CLEANED+1)); fi
  done
done
if [ "$CLEANED" -gt 0 ]; then echo "  ✓ 已清理旧版附件 $CLEANED 个"; else echo "  ✓ 旧版无附件或已清理"; fi

# 4. 创建 Gitee Release
echo "→ 创建 Gitee Release $TAG..."
BODY="## NND ${TAG}\n\n### 下载安装\n\n| 平台 | 文件 | 大小 | 下载 |\n|---|---|---|---|\n${DOWNLOAD_TABLE}\n> 💡 超过 100MB 的文件因 Gitee 限制无法直接上传，请通过 GitHub 链接下载。\n\n### 镜像\n\n- GitHub: https://github.com/${GH_OWNER}/${GH_REPO}/releases/tag/${TAG}\n- Gitee: https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/${TAG}"

RELEASE_RESP=$(curl -s -X POST "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases" \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\":\"$GITEE_TOKEN\",
    \"tag_name\":\"$TAG\",
    \"name\":\"NND ${TAG}\",
    \"body\":\"${BODY}\",
    \"prerelease\":false,
    \"target_commitish\":\"main\"
  }" 2>/dev/null)

RELEASE_ID=$(echo "$RELEASE_RESP" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).id)}catch(e){console.log('')}})" 2>/dev/null)

if [ -z "$RELEASE_ID" ]; then
  echo "[错误] Gitee Release 创建失败"
  echo "$RELEASE_RESP" | head -c 300
  exit 1
fi
echo "  ✓ Gitee Release ID: $RELEASE_ID"

# 5. 上传 <100MB 的产物
if [ -n "$UPLOAD_FILES" ]; then
  echo "→ 上传产物（<100MB）..."
  for file in $UPLOAD_FILES; do
    name=$(basename "$file")
    size=$(stat -c%s "$file")
    size_mb=$((size / 1048576))
    echo -n "  $name (${size_mb}MB)... "
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
      "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases/$RELEASE_ID/attach_files" \
      -H "Authorization: token $GITEE_TOKEN" \
      -F "file=@${file}" \
      -F "name=${name}" 2>/dev/null)
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
      echo "✓"
    else
      echo "✗ ($HTTP_CODE)"
    fi
  done
fi

echo ""
echo "✓ Gitee Release 同步完成"
echo "  Gitee: https://gitee.com/$GITEE_OWNER/$GITEE_REPO/releases/$TAG"
echo "  GitHub: https://github.com/$GH_OWNER/$GH_REPO/releases/tag/$TAG"
