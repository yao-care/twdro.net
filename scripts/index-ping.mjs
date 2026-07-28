#!/usr/bin/env node
// 主動通知 Google 重新爬取網址（Google Web Search Indexing API · urlNotifications:publish）。
//
// 與「寫死清單」的差別：本腳本每次執行都先用 URL Inspection API 查 sitemap 內每個網址的
// 實際收錄狀態，只對**尚未收錄**者送出通知。新頁自動納入、已收錄的頁不再浪費配額，
// 不必靠人記得維護清單（2026-07-28 前是 seo-ops site config 內 28 筆手動清單）。
//
// 前置（一次性，已完成）：
//   1. GCP 專案啟用「Web Search Indexing API」。
//   2. 服務帳號 ga4-insights@yaocare 在 Search Console 為「擁有者(Owner)」
//      —— 「完整(Full)」不夠，Indexing API 只認擁有者。
//
// 用法：
//   node scripts/index-ping.mjs            # 查收錄狀態 → 只推未收錄者（＋旗艦頁保底）
//   node scripts/index-ping.mjs --all      # 不查狀態，推 sitemap 全部網址
//   node scripts/index-ping.mjs --dry-run  # 只印出會推哪些，不實際送出
//   node scripts/index-ping.mjs <url>...   # 只推指定網址
//
// 配額：Indexing API 每日 200 筆（MAX_PER_RUN 留餘裕）；URL Inspection 每日 2000 筆、
// 每分鐘 600 筆（站上 ~83 頁，單次執行約 83 筆，餘裕充足）。

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const SA_KEY_FILE = process.env.TWDRO_SA_KEY_FILE || `${process.env.HOME}/.config/twdro/ga4-sa.json`;
const GSC_SITE = 'sc-domain:twdro.net';
const SITE = 'https://twdro.net';
const MAX_PER_RUN = 150; // 每日配額 200，留餘裕給手動補推
const INSPECT_CONCURRENCY = 4;

// 收錄狀態即使已 indexed 也永遠保底推送的旗艦頁（Google 重爬＝重新評估站台主軸）。
const FLAGSHIP = ['/', '/learn/', '/learn/what-is-drone-soccer/', '/rules/', '/events/'];

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 服務帳號 JWT-bearer → 存取權杖 */
async function getAccessToken(scope) {
  const { client_email, private_key } = JSON.parse(readFileSync(SA_KEY_FILE, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }));
  const signingInput = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const jwt = `${signingInput}.${b64url(signer.sign(private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`取權杖失敗：${data.error} ${data.error_description || ''}`);
  return data.access_token;
}

/**
 * 送出前的機械保底：補上遺漏的尾斜線（帶副檔名的檔案路徑不動）。
 * 本站 astro trailingSlash:'always'，`/rules` 會 301 到 `/rules/`——少一個斜線＝
 * 主動請 Google 收錄一個會重新導向的網址（GSC「頁面會重新導向」正是這樣累積的）。
 */
export function normalizeUrl(u) {
  try {
    const x = new URL(u);
    if (!x.pathname.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(x.pathname)) x.pathname += '/';
    return x.toString();
  } catch { return u; }
}

async function sitemapUrls() {
  const idx = await (await fetch(`${SITE}/sitemap-index.xml`)).text();
  const maps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const all = [];
  for (const m of maps) {
    const xml = await (await fetch(m)).text();
    all.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]));
  }
  return [...new Set(all.map(normalizeUrl))];
}

/** URL Inspection：回 coverageState 字串（失敗回 null，視同狀態未知→納入推送） */
async function inspect(token, url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: GSC_SITE }),
    });
    if (res.ok) return (await res.json()).inspectionResult?.indexStatusResult?.coverageState ?? null;
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000 * (i + 1))); continue; }
    return null;
  }
  return null;
}

/** 併發查收錄狀態，回 [{url, state}] */
async function inspectAll(urls) {
  const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const out = new Array(urls.length);
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const n = i++;
      out[n] = { url: urls[n], state: await inspect(token, urls[n]) };
    }
  };
  await Promise.all(Array.from({ length: INSPECT_CONCURRENCY }, worker));
  return out;
}

async function publish(token, url) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  if (!res.ok) throw new Error((await res.json()).error?.message || String(res.status));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicit = args.filter((a) => !a.startsWith('--')).map(normalizeUrl);

  let targets;
  if (explicit.length) {
    targets = [...new Set(explicit)];
    console.log(`[index-ping] 指定網址 ${targets.length} 筆`);
  } else if (args.includes('--all')) {
    targets = await sitemapUrls();
    console.log(`[index-ping] --all：sitemap 全部 ${targets.length} 筆`);
  } else {
    const urls = await sitemapUrls();
    const states = await inspectAll(urls);
    const notIndexed = states.filter((s) => s.state !== 'Submitted and indexed').map((s) => s.url);
    const flagship = FLAGSHIP.map((p) => SITE + p);
    targets = [...new Set([...notIndexed, ...flagship])];
    const tally = states.reduce((m, s) => ((m[s.state ?? '(查詢失敗)'] = (m[s.state ?? '(查詢失敗)'] || 0) + 1), m), {});
    console.log(`[index-ping] sitemap ${urls.length} 筆收錄狀態：` +
      Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('、'));
    console.log(`[index-ping] 未收錄 ${notIndexed.length} 筆＋旗艦頁保底 → 推送 ${targets.length} 筆`);
  }

  if (targets.length > MAX_PER_RUN) {
    console.log(`[index-ping] ⚠️ 超過單次上限 ${MAX_PER_RUN}，截斷（未推送 ${targets.length - MAX_PER_RUN} 筆，下次執行會再進清單）`);
    targets = targets.slice(0, MAX_PER_RUN);
  }
  if (dryRun) { targets.forEach((u) => console.log(`  (dry-run) ${u}`)); return; }

  const token = await getAccessToken('https://www.googleapis.com/auth/indexing');
  let ok = 0; const failures = [];
  for (const u of targets) {
    try { await publish(token, u); ok++; } catch (e) { failures.push(`${u}：${e.message}`); }
  }
  console.log(`[index-ping] 完成：成功 ${ok}／失敗 ${failures.length}`);
  failures.slice(0, 10).forEach((f) => console.log(`  ✗ ${f}`));
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
