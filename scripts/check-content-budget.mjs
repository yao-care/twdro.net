#!/usr/bin/env node
/**
 * 內容預算守門：預設擋下「自動層新增教育文」，只放行有新鮮、可追溯趨勢候選的單篇文章。
 *
 * 為什麼要擋（2026-07-30 用戶審 GSC 後定調，詳見 seo-ops playbook「2026-07-30 盤點」）：
 * 站上 28 篇 learn/ 教育文整週合計只賺 19 次曝光、1 次點擊，而 events/ 與 equipment/
 * 單一頁就有 16–18 次曝光。每天再多一篇教育文的邊際效益已趨近於零，卻讓每日自動化看起來
 * 有在做事。**通論題早已飽和，具體術語題（07-27 的假設）也已連兩篇驗證無效。**
 * 故自動層改為只維護既有文（內鏈、meta、合併瘦身）；唯一例外是 trend-radar.mjs
 * 已同時驗證搜尋需求與站內事實來源的單篇候選，且每天最多一篇。
 *
 * 還有第二層代價：全站 sitemap 90 個網址裡有 29 個是 learn（32%），而這個 10 天大、零外部
 * 連結的網域爬取預算極省——`/events/`（曝光最高的內容分區樞紐）自 7/24 起「已發現但從未被爬」，
 * 排在它前面消耗預算的正是這批教育文。停產不只省下寫的力氣，是把爬取預算讓回給賽事頁。
 *
 * 這一支是機械層——只寫在 playbook 裡的規則會被下一個 session 的自動化忽略，
 * 必須進 brain.gates 才有效（教訓見 sites/twdro.net.json 的 brain._gatesNote：
 * 守門測試沒接上 gates 就等於裝飾品）。
 *
 * 放行條件：人工要新增文章時，帶 ALLOW_NEW_LEARN=1 執行即可略過本檢查；自動層則必須
 * 讓新檔 frontmatter 的 trend_id 對上 seo-data/trends 最新 JSON 中 decision=publish 的候選。
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const LEARN = 'src/content/learn/';
const TREND_DIR = 'seo-data/trends/';

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

const trendIdFrom = (path) => readFileSync(path, 'utf8')
  .match(/^trend_id:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1] ?? '';

const latestTrendRecord = () => {
  if (!existsSync(TREND_DIR)) return null;
  const files = readdirSync(TREND_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();
  for (const name of files) {
    try {
      return JSON.parse(readFileSync(`${TREND_DIR}${name}`, 'utf8'));
    } catch {
      // 忽略半寫入或損壞的資料，繼續找上一份；找不到就不放行。
    }
  }
  return null;
};

const trend = latestTrendRecord();
const todayInTaipei = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const trendIsFresh = trend?.observed_on === todayInTaipei;
const publishable = new Map((trend?.candidates ?? [])
  .filter((candidate) => trendIsFresh && candidate?.decision === 'publish' && candidate?.publishable === true)
  .map((candidate) => [candidate.id, candidate]));
const trendAdded = list.filter((path) => publishable.has(trendIdFrom(path)));

if (list.length === 1 && trendAdded.length === 1) {
  const id = trendIdFrom(trendAdded[0]);
  const candidate = publishable.get(id);
  const sourceCount = Array.isArray(candidate?.source_urls) ? candidate.source_urls.length : 0;
  const article = readFileSync(trendAdded[0], 'utf8');
  const externalCitationCount = (article.match(/https?:\/\//g) ?? []).length;
  const requiredPhrases = Array.isArray(candidate?.required_phrases) ? candidate.required_phrases : [];
  const factsPresent = requiredPhrases.length >= 3 && requiredPhrases.every((phrase) => article.includes(phrase));
  const linkedSources = (candidate?.source_urls ?? [])
    .filter((url) => url.startsWith('https://'))
    .filter((url) => article.includes(url) || article.includes(new URL(url).pathname));
  if (sourceCount >= 2 && externalCitationCount >= 1 && factsPresent && linkedSources.length >= 2) {
    console.log(`[content-budget] ✓ 趨勢候選 ${id} 通過：雙引擎訊號、來源與每日一篇上限均已驗證`);
    process.exit(0);
  }
}

console.error(`[content-budget] ✗ 偵測到新增 ${list.length} 篇教育文，自動層未取得趨勢候選放行：`);
for (const p of list) console.error(`    ${p}`);
console.error('');
console.error('  只有最新 seo-data/trends/*.json 中 decision=publish 的 trend_id 可新增一篇；');
console.error('  若是人工作業，請使用 ALLOW_NEW_LEARN=1，並在文章內保留可點來源。');
console.error('  人工確實要新增：ALLOW_NEW_LEARN=1 node scripts/check-content-budget.mjs');
process.exit(1);
