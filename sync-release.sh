#!/usr/bin/env bash
# 同步 GitHub Release 到 Gitee（下载 GitHub 产物 → 创建 Gitee Release → 上传产物）
# 用法: ./sync-release.sh <tag> [gitee_token]
# 示例: ./sync-release.sh v2.4.0
set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$DIR"

TAG="${1:?用法: ./sync-release.sh <tag> [gitee_token]}"
GITEE_TOKEN="${2:-72f57effb791521aa223da7348376b1d}"
GITEE_OWNER="kane25000"
GITEE_REPO="NND"
TEMP_DIR="$DIR/.temp/gitee-release"

echo "=== 同步 GitHub Release $TAG → Gitee ==="

# 1. 下载 GitHub Release 产物
echo "→ 下载 GitHub $TAG 产物..."
mkdir -p "$TEMP_DIR"
rm -f "$TEMP_DIR"/*
gh release download "$TAG" --dir "$TEMP_DIR" --clobber --repo kane250/NND 2>/dev/null || {
  echo "[错误] GitHub Release $TAG 下载失败"
  exit 1
}
FILE_COUNT=$(ls "$TEMP_DIR" | wc -l)
echo "  ✓ 下载 $FILE_COUNT 个文件"

# 2. 获取 GitHub Release 信息
BODY=$(gh release view "$TAG" --json body --jq '.body' --repo kane250/NND 2>/dev/null || echo "")
RELEASE_NAME=$(gh release view "$TAG" --json name --jq '.name' --repo kane250/NND 2>/dev/null || echo "$TAG")

# 3. 创建 Gitee Release
echo "→ 创建 Gitee Release $TAG..."
RELEASE_RESP=$(curl -s -X POST "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases" \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\":\"$GITEE_TOKEN\",
    \"tag_name\":\"$TAG\",
    \"name\":\"$RELEASE_NAME\",
    \"body\":\"$BODY\n\n---\n\n镜像同步自 GitHub: https://github.com/kane250/NND/releases/tag/$TAG\n\n注意: 超过 100MB 的文件已分卷（.part0/.part1），下载后用 cat file.part0 file.part1 > file 合并\",
    \"prerelease\":false,
    \"target_commitish\":\"main\"
  }" 2>/dev/null)

RELEASE_ID=$(echo "$RELEASE_RESP" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).id)}catch(e){console.log('')}})" 2>/dev/null)

if [ -z "$RELEASE_ID" ] || [ "$RELEASE_ID" = "" ]; then
  echo "[错误] Gitee Release 创建失败"
  echo "$RELEASE_RESP" | head -c 300
  exit 1
fi
echo "  ✓ Gitee Release ID: $RELEASE_ID"

# 4. 上传产物（>100MB 分卷）
echo "→ 上传产物..."
UPLOADED=0
FAILED=0
for file in "$TEMP_DIR"/*; do
  name=$(basename "$file")
  size=$(stat -c%s "$file")
  
  if [ $size -gt 104857600 ]; then
    # 分卷上传
    echo "  $name ($(numfmt --to=iec $size)) — 分卷上传"
    split -b 90m -d -a 1 "$file" "$file.part"
    for part in "$file".part*; do
      partname=$(basename "$part")
      HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases/$RELEASE_ID/attach_files" \
        -H "Authorization: token $GITEE_TOKEN" \
        -F "file=@${part}" \
        -F "name=${partname}" 2>/dev/null)
      if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        echo "    ✓ $partname"
        UPLOADED=$((UPLOADED+1))
      else
        echo "    ✗ $partname ($HTTP_CODE)"
        FAILED=$((FAILED+1))
      fi
    done
    rm -f "$file".part*
  else
    # 直接上传
    echo -n "  $name ($(numfmt --to=iec $size))... "
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
      "https://gitee.com/api/v5/repos/$GITEE_OWNER/$GITEE_REPO/releases/$RELEASE_ID/attach_files" \
      -H "Authorization: token $GITEE_TOKEN" \
      -F "file=@${file}" \
      -F "name=${name}" 2>/dev/null)
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
      echo "✓"
      UPLOADED=$((UPLOADED+1))
    else
      echo "✗ ($HTTP_CODE)"
      FAILED=$((FAILED+1))
    fi
  fi
done

echo ""
echo "✓ Gitee Release 同步完成"
echo "  上传成功: $UPLOADED  失败: $FAILED"
echo "  Gitee: https://gitee.com/$GITEE_OWNER/$GITEE_REPO/releases/$TAG"
