#!/usr/bin/env bash
# 把 pipeline 產出的「乾淨候選」（無個資）直接併入 main 自動上站。
# 讀 pipeline/state/auto-paths.txt（每行一個路徑，含 manifest），只 add 這些路徑，
# 有實質變更才 commit + rebase + push origin main。無變更／無檔案 → 安靜結束。
#
# 個資邊界：本腳本只處理「未偵測到人名」的候選；夾到人名者由 run.py 導向 pr-paths.txt，
# 走 create-pull-request 人審，絕不經此自動上站。
set -euo pipefail

LABEL="${1:-pipeline 自動更新}"
LIST="pipeline/state/auto-paths.txt"

if [[ ! -s "$LIST" ]]; then
  echo "無自動候選（$LIST 不存在或為空），略過。"
  exit 0
fi

# 收集存在的路徑（容忍空行與已被刪除的檔）
mapfile -t paths < <(grep -v '^[[:space:]]*$' "$LIST")
existing=()
for p in "${paths[@]}"; do
  [[ -e "$p" ]] && existing+=("$p")
done
if [[ ${#existing[@]} -eq 0 ]]; then
  echo "候選路徑皆不存在，略過。"
  exit 0
fi

git config user.name "twdro-pipeline[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "${existing[@]}"

if git diff --cached --quiet; then
  echo "暫存區無實質變更（資料與 main 相同），略過 commit。"
  exit 0
fi

git commit -m "data(pipeline): ${LABEL}"

# 併 main 前先 rebase，避開與 seo-ops brain/reflect 的偶發同時推送（非 fast-forward）
git pull --rebase --autostash origin main
git push origin HEAD:main
echo "已自動併入 main：${LABEL}"
