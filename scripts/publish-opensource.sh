#!/bin/bash
# ============================================================
# 开源版本发布脚本
# - 首次发布：创建孤儿分支（无历史）
# - 后续发布：基于公开仓库历史追加 commit（用户可 git pull）
# 用法: bash scripts/publish-opensource.sh
# ============================================================

set -e

echo ""
echo "🚀 开始发布开源版本..."

# 确保当前在 main 分支，且工作区干净
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ 请先切换到 main 分支再运行发布脚本"
  exit 1
fi

# 自动 stash 所有改动（含未追踪文件），发布完再恢复
HAS_CHANGES=false
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "📦 检测到未提交改动，自动暂存中（git stash -u）..."
  git stash -u
  HAS_CHANGES=true
fi

# 检查公开仓库是否已有历史
echo "🔍 检查公开仓库状态..."
git fetch public 2>/dev/null || true
PUBLIC_HAS_HISTORY=$(git ls-remote public main 2>/dev/null | wc -l | tr -d ' ')

if [ "$PUBLIC_HAS_HISTORY" = "0" ]; then
  # ========== 首次发布：孤儿分支 ==========
  echo "📦 首次发布，创建干净的孤儿分支..."
  git checkout --orphan release-public
  git add -A
else
  # ========== 后续发布：基于公开仓库历史追加 commit ==========
  echo "📦 增量发布，基于公开仓库历史追加 commit..."
  git checkout -b release-public public/main
  # 将当前 main 的所有文件覆盖进来
  git checkout main -- .
  git add -A
fi

# 从提交中移除不应公开的内容
echo "🧹 清理私有内容..."
git rm --cached .env -f 2>/dev/null || true                  # 本地 env（含真实配置）
git rm -r --cached .github/workflows/ 2>/dev/null || true    # CI 流水线（不对外）
git rm -r --cached .agent/ 2>/dev/null || true               # AI 工具目录
git rm -r --cached .artifacts/ 2>/dev/null || true           # AI 工具数据
git rm -r --cached .shared/ 2>/dev/null || true              # AI 工具数据

# 计算更新次数（公开仓库已有 commit 数 + 1）
if [ "$PUBLIC_HAS_HISTORY" != "0" ]; then
  UPDATE_COUNT=$(git rev-list --count public/main 2>/dev/null || echo "0")
  UPDATE_COUNT=$((UPDATE_COUNT + 1))
else
  UPDATE_COUNT=1
fi

# 从 CHANGELOG.md 提取最新版本信息作为 commit message
CHANGELOG_FILE="CHANGELOG.md"
if [ -f "$CHANGELOG_FILE" ]; then
  # 提取最新版本号（第一个 ## [vX.X] 行）
  LATEST_VERSION=$(grep -m1 '^\#\# \[v' "$CHANGELOG_FILE" | sed 's/## \[\(.*\)\].*/\1/')
  # 提取最新版本的变更内容（从第一个 ## [v 到下一个 ## [v 或文件末尾）
  CHANGELOG_BODY=$(awk '/^## \[v/{if(found) exit; found=1; next} found' "$CHANGELOG_FILE" | sed '/^---$/d' | sed '/^$/d')
  COMMIT_MSG="release: ${LATEST_VERSION:-opensource} - Update #${UPDATE_COUNT}

${CHANGELOG_BODY}"
else
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  COMMIT_MSG="release: Update #${UPDATE_COUNT} - $TIMESTAMP"
fi

# 提交快照
git commit -m "$COMMIT_MSG" 2>/dev/null || {
  echo "ℹ️  无可提交的改动，版本已是最新"
  git checkout -f main
  git branch -D release-public 2>/dev/null || true
  exit 0
}
echo "✅ 快照 commit 已创建"
echo ""
echo "📋 Commit 内容："
echo "$COMMIT_MSG"

# 推送到公开仓库（首次强推，后续普通推送）
echo "⬆️  推送到公开仓库..."
if [ "$PUBLIC_HAS_HISTORY" = "0" ]; then
  git push public release-public:main --force
else
  git push public release-public:main
fi

echo ""
echo "=============================================="
echo "✅ 开源版本发布成功！"
echo "🔗 https://github.com/waoowaooAI/waoowaoo"
echo "=============================================="
echo ""

# 切回 main 分支，删除临时分支
git checkout -f main
git branch -D release-public

echo "🔙 已切回 main 分支，临时分支已清理"
echo ""

# 恢复之前暂存的改动
if [ "$HAS_CHANGES" = true ]; then
  echo "♻️  恢复暂存的工作区改动..."
  git stash pop
fi
