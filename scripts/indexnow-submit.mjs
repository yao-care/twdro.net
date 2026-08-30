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
// 只推 lastmod 在 RECENT_DAYS 內的網址：每次 push 都把整份 sitemap 推一次是噪音，
// 對方會降低信任。沒有任何近期網址就直接跳過，不發空請求。

import { readFileSync, existsSync } from 'node:fs';

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

function recentUrls(xml, cutoff) {
  const urls = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>(\d{4}-\d{2}-\d{2})/)?.[1];
    if (loc && lastmod && lastmod >= cutoff) urls.push(loc);
  }
  return urls;
}

async function main() {
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString().slice(0, 10);
  const urlList = recentUrls(await loadSitemap(), cutoff);

  if (urlList.length === 0) {
    console.log(`IndexNow：${cutoff} 之後沒有更新的網址，略過提交。`);
    return;
  }

  if (process.argv.includes('--dry-run')) {
    console.log(`IndexNow（dry-run）：會提交 ${urlList.length} 個網址（cutoff ${cutoff}）`);
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

main().catch((e) => {
  console.warn(`IndexNow 提交失敗（不影響部署）：${e.message}`);
});
