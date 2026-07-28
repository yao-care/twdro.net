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
import { join } from 'node:path';

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

  if (!existsSync(contentDir)) return map;

  for (const collection of readdirSync(contentDir, { withFileTypes: true })) {
    if (!collection.isDirectory()) continue;
    const dir = join(contentDir, collection.name);
    for (const file of readdirSync(dir)) {
      if (!/\.(md|ya?ml)$/.test(file)) continue;
      const text = readFileSync(join(dir, file), 'utf8');
      const date = extractDate(text);
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
    }
  }

  // 首頁彙整全站：任何一頁更新，首頁的內容（近期賽事、最新消息）也可能跟著變。
  let overall = null;
  for (const d of map.values()) overall = maxDate(overall, d);
  put('/', overall);

  return map;
}
