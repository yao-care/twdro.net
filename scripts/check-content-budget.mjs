#!/usr/bin/env node
/**
 * 內容預算守門：擋下「自動層新增教育文」。
 *
 * 為什麼要擋（2026-07-30 用戶審 GSC 後定調，詳見 seo-ops playbook「2026-07-30 盤點」）：
 * 站上 28 篇 learn/ 教育文整週合計只賺 19 次曝光、1 次點擊，而 events/ 與 equipment/
 * 單一頁就有 16–18 次曝光。每天再多一篇教育文的邊際效益已趨近於零，卻讓每日自動化看起來
 * 有在做事。**通論題早已飽和，具體術語題（07-27 的假設）也已連兩篇驗證無效。**
 * 故自動層改為只維護既有文（內鏈、meta、合併瘦身），不再新增。
 *
 * 還有第二層代價：全站 sitemap 90 個網址裡有 29 個是 learn（32%），而這個 10 天大、零外部
 * 連結的網域爬取預算極省——`/events/`（曝光最高的內容分區樞紐）自 7/24 起「已發現但從未被爬」，
 * 排在它前面消耗預算的正是這批教育文。停產不只省下寫的力氣，是把爬取預算讓回給賽事頁。
 *
 * 這一支是機械層——只寫在 playbook 裡的規則會被下一個 session 的自動化忽略，
 * 必須進 brain.gates 才有效（教訓見 sites/twdro.net.json 的 brain._gatesNote：
 * 守門測試沒接上 gates 就等於裝飾品）。
 *
 * 放行條件：人工要新增文章時，帶 ALLOW_NEW_LEARN=1 執行即可略過本檢查。
 */
import { execSync } from 'node:child_process';

const LEARN = 'src/content/learn/';

if (process.env.ALLOW_NEW_LEARN === '1') {
  console.log('[content-budget] ALLOW_NEW_LEARN=1，略過新增教育文檢查（人工作業）');
  process.exit(0);
}

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
};

const added = new Set();

// (1) 尚未追蹤的新檔
for (const line of sh('git status --porcelain --untracked-files=all').split('\n')) {
  const path = line.slice(3).trim();
  if (line.startsWith('??') && path.startsWith(LEARN)) added.add(path);
}

// (2) 已 stage 的新增
for (const path of sh('git diff --cached --name-only --diff-filter=A').split('\n')) {
  if (path.startsWith(LEARN)) added.add(path.trim());
}

// (3) 已 commit 但還沒推上去的新增（brain 會自己 commit，光看工作區會漏）
const base = sh('git rev-parse --verify --quiet origin/main').trim();
if (base) {
  for (const path of sh(`git diff --name-only --diff-filter=A ${base}..HEAD`).split('\n')) {
    if (path.startsWith(LEARN)) added.add(path.trim());
  }
}

const list = [...added].filter(Boolean).sort();
if (!list.length) {
  console.log('[content-budget] ✓ 沒有新增教育文');
  process.exit(0);
}

console.error(`[content-budget] ✗ 偵測到新增 ${list.length} 篇教育文，自動層已禁止新增：`);
for (const p of list) console.error(`    ${p}`);
console.error('');
console.error('  理由：learn/ 整組整週 19 曝光／1 點擊，新增一篇的邊際效益趨近於零；');
console.error('  現階段方向是賽事資料（events/）與既有文的內鏈維護，見 playbook 2026-07-30 盤點。');
console.error('  人工確實要新增：ALLOW_NEW_LEARN=1 node scripts/check-content-budget.mjs');
process.exit(1);
