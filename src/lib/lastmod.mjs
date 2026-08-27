// sitemap 的 <lastmod> 單一真實來源。
//
// 為什麼需要（2026-07-28）：建站時 trailingSlash 設定錯誤（見 tests/trailing-slash.test.ts），
// 7/21 修正後帶斜線網址對 Google 而言是全新網址、必須重新排隊探索。到 7/28 仍有 16 個
// 網址停在「已找到／尚未建立索引」，其中包含 /learn/ 與 /learn/what-is-drone-soccer/
// ——後者是全站主題定義頁，站內有 19 個內鏈指向它。內鏈不是問題，缺的是「這頁有更新、
// 值得重抓」的訊號：sitemap 83 個網址一個 lastmod 都沒有。
//
// 日期取自內容本身而非建置時間：教育文用 frontmatter 的 updated_at，資料型集合用各來源
// 的 retrieved_at（＝站上顯示的查核日期）取最大值。索引頁取旗下條目的最大值。
// 全站統一蓋建置日期是假訊號，Google 會學會忽略，所以不那麼做——沒有可信日期的頁面
// （如法務頁）就不輸出 lastmod，這在 sitemap 規格裡是合法的。

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { citySlug } from './geo.mjs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// 只認這三個欄位：它們的語意都是「我方最後確認的時間」。
// 刻意排除 event_start／registration_end（未來日期）與 published_at（他方發布日，
// 可能遠早於我方收錄日），兩者都不代表本站頁面何時更新。
const DATE_FIELDS = /(?:^|\n)\s*(?:updated_at|retrieved_at|date)\s*:\s*"?(\d{4}-\d{2}-\d{2})"?/g;

// 集合 → 明細頁 URL 前綴。未列出者代表該集合沒有明細頁。
const DETAIL_BASE = {
  learn: '/learn/',
  events: '/events/',
  equipment: '/equipment/',
  teams: '/teams/',
  venues: '/venues/',
  organizations: '/organizations/',
  rulebooks: '/rules/',
};

// 明細頁前綴 → 索引頁（索引頁 lastmod = 旗下條目最大值）。
const INDEX_OF = {
  '/learn/': '/learn/',
  '/events/': '/events/',
  '/equipment/': '/equipment/',
  '/teams/': '/teams/',
  '/venues/': '/venues/',
  '/organizations/': '/organizations/',
  '/rules/': '/rules/',
};

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * 檔案路徑 → 最後一次 commit 日期（YYYY-MM-DD）的對照表，一次 git log 掃完。
 *
 * 為什麼需要（2026-07-28 補）：venues（4 檔）與 organizations（8 檔）的 YAML 沒有任何
 * 日期欄位，src/pages 下的靜態頁（/equipment/compliance-check/、/sitemap/、法務頁）
 * 更是連內容檔都沒有——第一版 lastmod 完全漏掉它們，而 /venues/、/organizations/、
 * /organizations/oursteam/、/equipment/compliance-check/ 正好都卡在未收錄清單裡。
 * commit 日期就是「這個檔案最後被改動的時間」，比在 12 個檔案裡補造 retrieved_at 誠實。
 *
 * 內容自帶的日期優先（那是「資料查核日」，語意更貼近讀者看到的東西）；git 只當退路。
 * 淺層 clone（fetch-depth: 1）拿不到完整歷史，故 CI 的 checkout 需設 fetch-depth: 0；
 * 真的取不到就回空表，退化成「沒有 lastmod」而不是給錯日期。
 */
function gitDateMap() {
  /** @type {Map<string, string>} */
  const map = new Map();
  let out;
  try {
    out = execFileSync('git', ['log', '--format=%cs', '--name-only', '--', 'src/'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // 某些受限的測試／建置執行器會在子程序結束後回報 EPERM，但 stdout 已經完整回來；
    // 只要有可解析的 git 輸出，仍可安全使用，真正沒有輸出的錯誤才退化成空表。
    if (typeof error?.stdout !== 'string') return map;
    out = error.stdout;
  }
  let current = null;
  for (const line of out.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) { current = line; continue; }
    const file = line.trim();
    // git log 由新到舊，第一次見到的檔案即最新一次改動；已記錄者不覆蓋。
    if (file && current) {
      const absolutePath = resolve(REPO_ROOT, file);
      if (!map.has(absolutePath)) map.set(absolutePath, current);
    }
  }
  return map;
}

/** 從單一檔案內容抽出最新的我方確認日期（YYYY-MM-DD），沒有則回 null。 */
export function extractDate(text) {
  let latest = null;
  for (const m of text.matchAll(DATE_FIELDS)) latest = maxDate(latest, m[1]);
  return latest;
}

/**
 * 掃描 content 目錄，產出 pathname → 'YYYY-MM-DD' 的對照表。
 * @param {string} contentDir 通常是 src/content
 * @param {string} today 上限日期，避免資料填錯把 lastmod 寫到未來
 */
export function buildLastmodMap(contentDir, today) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const put = (path, date) => {
    if (!date) return;
    const d = date > today ? today : date;
    map.set(path, maxDate(map.get(path), d));
  };

  const contentRoot = resolve(REPO_ROOT, contentDir);
  if (!existsSync(contentRoot)) return map;
  const gitDates = gitDateMap();

  for (const collection of readdirSync(contentRoot, { withFileTypes: true })) {
    if (!collection.isDirectory()) continue;
    const dir = join(contentRoot, collection.name);
    for (const file of readdirSync(dir)) {
      if (!/\.(md|ya?ml)$/.test(file)) continue;
      const path = join(dir, file);
      const text = readFileSync(path, 'utf8');
      // 內容自帶的查核日優先，沒有才退回 git commit 日期。
      const date = extractDate(text) ?? gitDates.get(path) ?? null;
      if (!date) continue;
      const slug = file.replace(/\.(md|ya?ml)$/, '');

      // rules 是規則書的條文分章，沒有自己的頁；併入所屬規則書頁。
      if (collection.name === 'rules') {
        const owner = text.match(/(?:^|\n)rulebook\s*:\s*"?([\w-]+)"?/)?.[1];
        if (owner) {
          put(`/rules/${owner}/`, date);
          put('/rules/', date);
        }
        continue;
      }
      // news 只有索引頁，沒有明細頁。
      if (collection.name === 'news') {
        put('/news/', date);
        continue;
      }

      const base = DETAIL_BASE[collection.name];
      if (!base) continue;
      put(`${base}${slug}/`, date);
      if (INDEX_OF[base]) put(INDEX_OF[base], date);

      // 縣市彙整頁沒有自己的內容檔——它是由賽事交叉產生的，所以 lastmod 要從賽事回推：
      // 取該縣市所有賽事查核日的最大值。不接這一段的話，這一整層在 sitemap 裡沒有
      // lastmod，而那正是 2026-07-28 讓 16 個網址卡在「已找到／尚未建立索引」的原因。
      // 用同一份 geo.mjs 的對照表，避免與頁面端走鐘（走鐘的樣子是某個縣市頁沒有 lastmod）。
      if (collection.name === 'events' && !/(?:^|\n)status\s*:\s*draft\b/.test(text)) {
        const city = text.match(/(?:^|\n)\s+city\s*:\s*"?([^"\n]+)"?/)?.[1]?.trim();
        const cs = citySlug(city);
        if (cs) put(`/events/city/${cs}/`, date);
      }
    }
  }

  // 靜態頁（工具頁、法務頁、FAQ…）沒有對應的內容檔，用 .astro 本身的 commit 日期。
  // 動態路由（檔名含 []）跳過——那些網址的日期已由上面的集合掃描給出。
  for (const [path, date] of walkPages(resolve(REPO_ROOT, 'src/pages'), gitDates)) put(path, date);

  // 首頁彙整全站：任何一頁更新，首頁的內容（近期賽事、最新消息）也可能跟著變。
  let overall = null;
  for (const d of map.values()) overall = maxDate(overall, d);
  put('/', overall);

  return map;
}

/** 掃 src/pages 的靜態 .astro，回傳 [pathname, date] 陣列。 */
function walkPages(dir, gitDates, prefix = '/') {
  /** @type {[string, string][]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkPages(full, gitDates, `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith('.astro') || entry.name.includes('[')) continue;
    const date = gitDates.get(full);
    if (!date) continue;
    const base = entry.name.replace(/\.astro$/, '');
    out.push([base === 'index' ? prefix : `${prefix}${base}/`, date]);
  }
  return out;
}
