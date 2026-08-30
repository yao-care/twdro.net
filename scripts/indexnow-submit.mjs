#!/usr/bin/env node
// 部署後把「最近有更新的頁面」主動推給 IndexNow（Bing、Yandex、Seznam、Naver 共用）。
//
// 為什麼（2026-07-28）：本站 7/21 修掉 trailingSlash 設定錯誤後，帶斜線網址對搜尋引擎
// 是全新網址、得重新排隊探索，到 7/28 仍有 16 頁停在「已找到／尚未建立索引」。sitemap
// 的 lastmod（見 src/lib/lastmod.mjs）是被動訊號，IndexNow 是主動推送，兩者互補。
//
// Google 不參與 IndexNow，所以這支腳本救不了 Google 的收錄——Google 端只能靠 lastmod
// 與 Search Console 手動「要求建立索引」。別把這支腳本的成功輸出當成 Google 已收到。
//
// 推什麼：**跟上線前相比 lastmod 真的變了、或整個網址是新的**。
//
// 2026-08-30 修正。原本的規則是「推 lastmod 在 RECENT_DAYS 內的網址」，實際效果是
// **每次部署都把同一批網址重推一次**，直到它們自然滑出 3 天窗為止。當天實測：
// 15:15 那次部署推 106 筆、22:30 那次推 105 筆，相隔 7 小時、幾乎同一批，
// 而第二次實際只改了一個內容檔。IndexNow 的用意是通知「這幾個網址變了」，
// 整批重送會稀釋訊號，對方也會降低信任——**送得多不等於送得準**。
//
// 為什麼不是改成「只推 lastmod == 今天」：lastmod 來自內容的 updated_at／retrieved_at
// （見 src/lib/lastmod.mjs），不是檔案的編輯日。2026-08-30 當天改了兩個賽事檔，
// 但整份 sitemap 沒有任何一筆 lastmod 是當天——那條規則會讓推送永遠是 0 筆，
// 那是靜音不是修好。
//
// 比較基準怎麼來：deploy.yml 在**上線之前**把當時的線上 sitemap 抓成快照當 artifact，
// 這支腳本在上線之後拿它跟新的線上 sitemap 對比。CI 的 runner 沒有跨次執行的狀態，
// 而「上一版的線上 sitemap」本身就是最準的狀態，不必另外存。
// 快照缺席（第一次跑、抓取失敗）時退回舊的 RECENT_DAYS 規則，寧可多推也不要漏推。

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HOST = 'twdro.net';
const KEY = 'be644c81fe9010bea60de485d1544bf2';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const LOCAL_SITEMAP = 'dist/sitemap-0.xml';
const LIVE_SITEMAP = `https://${HOST}/sitemap-0.xml`;
const RECENT_DAYS = 3;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// 預設讀線上 sitemap：CI 在 deploy 之後才呼叫這支，讀線上才能保證推出去的網址
// 真的已經上線（推了還沒上線的網址會被記成抓取失敗）。--local 給本機驗證用。
async function loadSitemap() {
  if (process.argv.includes('--local')) {
    if (!existsSync(LOCAL_SITEMAP)) {
      console.error(`找不到 ${LOCAL_SITEMAP}，請先 npm run build`);
      process.exit(1);
    }
    return readFileSync(LOCAL_SITEMAP, 'utf8');
  }
  const res = await fetch(LIVE_SITEMAP);
  if (!res.ok) throw new Error(`讀取 ${LIVE_SITEMAP} 失敗：${res.status}`);
  return res.text();
}

// 解析成 loc → lastmod（沒有 lastmod 的記成空字串，照樣參與比較）。
export function lastmodMap(xml) {
  const map = new Map();
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) continue;
    map.set(loc, block.match(/<lastmod>(\d{4}-\d{2}-\d{2})/)?.[1] ?? '');
  }
  return map;
}

/** 新出現的網址，加上 lastmod 與上一版不同的網址。消失的網址不推（那要靠轉址與 404）。 */
export function changedUrls(prevXml, curXml) {
  const prev = lastmodMap(prevXml);
  const cur = lastmodMap(curXml);
  const out = [];
  for (const [loc, lastmod] of cur) {
    if (!prev.has(loc) || prev.get(loc) !== lastmod) out.push(loc);
  }
  return out;
}

export function recentUrls(xml, cutoff) {
  const urls = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>(\d{4}-\d{2}-\d{2})/)?.[1];
    if (loc && lastmod && lastmod >= cutoff) urls.push(loc);
  }
  return urls;
}

// --previous <path>：上線前的 sitemap 快照。有它就走「只推真的變了的」。
function previousSitemap() {
  const i = process.argv.indexOf('--previous');
  if (i === -1) return null;
  const path = process.argv[i + 1];
  if (!path || !existsSync(path)) return null;
  const xml = readFileSync(path, 'utf8').trim();
  return xml.includes('<loc>') ? xml : null;
}

async function main() {
  const current = await loadSitemap();
  const prev = previousSitemap();
  let urlList;
  let why;

  if (prev) {
    urlList = changedUrls(prev, current);
    why = '與上線前的快照比對';
  } else {
    const cutoff = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString().slice(0, 10);
    urlList = recentUrls(current, cutoff);
    why = `沒有可比較的快照，退回 lastmod ≥ ${cutoff}`;
  }

  if (urlList.length === 0) {
    console.log(`IndexNow：${why} → 沒有需要通知的網址，略過提交。`);
    return;
  }
  console.log(`IndexNow：${why} → 挑出 ${urlList.length} 個網址`);

  if (process.argv.includes('--dry-run')) {
    console.log(`IndexNow（dry-run）：會提交 ${urlList.length} 個網址`);
    for (const u of urlList) console.log(`  ${u}`);
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  // IndexNow 成功回 200 或 202；其他狀態印出但不讓部署失敗——搜尋引擎推送失敗
  // 不該擋住網站上線。
  console.log(`IndexNow：提交 ${urlList.length} 個網址，回應 ${res.status}`);
  for (const u of urlList) console.log(`  ${u}`);
  if (!res.ok && res.status !== 202) console.warn(`IndexNow 回應非成功狀態：${res.status} ${await res.text()}`);
}

// 被 import 時（測試）不執行主流程。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.warn(`IndexNow 提交失敗（不影響部署）：${e.message}`);
  });
}
