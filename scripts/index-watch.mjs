#!/usr/bin/env node
// 全站收錄狀態監測＋主動推送（Google Search Console URL Inspection + Web Search Indexing API）。
//
// 為什麼這支腳本存在（2026-07-28）：
//   GSC 的「未編入索引」通知信在本站反覆出現，過去每次處理都是同一招——把沒收錄的網址
//   補進 seo-ops site config 的手動 indexPing 清單再推一次（12→19→28 筆）。但翻 8 天的
//   收錄歷史可以證明這招對「已被 Google 發現、只是還沒排到爬」的頁**完全無效**：
//   /learn/、/events/、/venues/、/organizations/、/learn/what-is-drone-soccer/ 自 7/24 起
//   天天在推送清單裡，7/27 仍全數停在 Discovered - currently not indexed，且 lastCrawlTime
//   為空（Google 從未爬過）。推送只對「Google 還不知道這個網址」有效（對照證據：/faq/ 進
//   清單後一天內 URL is unknown → Submitted and indexed）。
//
//   換句話說，收錄與否有相當部分不在站方控制內（新站爬取預算），**能徹底解決的不是「讓它
//   歸零」，而是「不要再靠 Google 寄信才知道」**。所以這支腳本做三件事：
//     1. 掃 sitemap 全站收錄狀態並落盤，累積歷史（原本每日只追 13 個 trackUrls）。
//     2. 對尚未收錄的網址送 Indexing API（有效的那部分＝Google 還不知道的新頁）。
//     3. 對「卡住 ≥ STUCK_DAYS 天」的網址主動發 Slack 告警——這才是防止反覆發生的關鍵：
//        新頁卡住當天就看得到，不必等 GSC 通知信（延遲 2–3 天且不附網址清單）。
//
// 前置（一次性，已完成）：GCP 專案啟用 Web Search Indexing API；服務帳號 ga4-insights@yaocare
// 在 Search Console 為「擁有者(Owner)」——「完整(Full)」不夠，Indexing API 只認擁有者。
//
// 用法：
//   node scripts/index-watch.mjs             # 掃描 → 落盤 → 推送 → 卡住告警（每日 cron 走這條）
//   node scripts/index-watch.mjs --report    # 只掃描與印報告，不推送、不告警
//   node scripts/index-watch.mjs --dry-run   # 印出會推送哪些網址，不實際送出
//   node scripts/index-watch.mjs --all       # 不查狀態，推 sitemap 全部網址
//   node scripts/index-watch.mjs <url>...    # 只推指定網址
//
// 配額：Indexing API 每日 200 筆（MAX_PER_RUN 留餘裕）；URL Inspection 每日 2000 筆、
// 每分鐘 600 筆（單次執行約掃 sitemap 全部網址，張數見 `curl -s https://twdro.net/sitemap-0.xml | grep -o '<loc>' | wc -l`）。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SA_KEY_FILE = process.env.TWDRO_SA_KEY_FILE || `${process.env.HOME}/.config/twdro/ga4-sa.json`;
const SLACK_TOKEN_FILE = process.env.TWDRO_SLACK_TOKEN_FILE || `${process.env.HOME}/.config/twdro/slack-bot-token`;
const SLACK_CHANNEL = 'C0BHZ9QJ37Z';
const GSC_SITE = 'sc-domain:twdro.net';
const SITE = 'https://twdro.net';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_FILE = join(REPO, 'seo-data/coverage/history.json');

const MAX_PER_RUN = 120;       // 🔴 這是「本站在 GCP 專案 yaocare 裡分到多少」，不是全部配額。
                               //    Indexing API 的 200/日綁**雲端專案**，不綁站台。
                               //    別在這裡寫死「有誰共用、各分多少」——那種敘述會過期並害人做錯決定：
                               //    2026-08-21 有人依一段舊敘述以為 folk.tw 還在跟本站搶 yaocare，
                               //    把 folk 掐到 120、本站掐到 40，實際上 folk.tw 08-20 就搬去自己的
                               //    專案 folk-tw 了，兩邊都被過期的文字綁住。
                               //    要改這個數字，先跑：node /mnt/customers/seo-ops/bin/gsc-permission-audit.mjs
                               //    它會列出哪些站真的共用同一個專案、各站當日實際用量怎麼查。
                               //    （2026-08-22 實測：yaocare 專案 10 站當日合計 39/200，本站 28 是最大宗。）
const INSPECT_CONCURRENCY = 4;
const STUCK_DAYS = 7;          // 連續幾天未收錄才算「卡住」值得告警（新頁 2–5 天內收錄屬正常）

const INDEXED = 'Submitted and indexed';

// 收錄狀態即使已 indexed 也永遠保底推送的旗艦頁（Google 重爬＝重新評估站台主軸）。
const FLAGSHIP = ['/', '/learn/', '/learn/what-is-drone-soccer/', '/rules/', '/events/'];

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

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
 * 本站 astro trailingSlash:'always'，`/rules` 會 301 到 `/rules/`——少一個斜線＝主動請
 * Google 收錄一個會重新導向的網址（GSC「頁面會重新導向」正是這樣累積出來的）。
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

/** URL Inspection：回 {state, lastCrawl}（查詢失敗回 state:null，視同狀態未知→納入推送） */
async function inspect(token, url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: GSC_SITE }),
    });
    if (res.ok) {
      const r = (await res.json()).inspectionResult?.indexStatusResult ?? {};
      return { state: r.coverageState ?? null, lastCrawl: r.lastCrawlTime ?? null };
    }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000 * (i + 1))); continue; }
    return { state: null, lastCrawl: null };
  }
  return { state: null, lastCrawl: null };
}

/** 併發查收錄狀態，回 [{url, state, lastCrawl}] */
async function inspectAll(urls) {
  const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const out = new Array(urls.length);
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const n = i++;
      out[n] = { url: urls[n], ...(await inspect(token, urls[n])) };
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

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return { urls: {}, lastAlert: { date: null, urls: [] } };
  try { return JSON.parse(readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return { urls: {}, lastAlert: { date: null, urls: [] } }; }
}

function saveHistory(h) {
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2) + '\n');
}

/**
 * 以歷史檔累積「首次觀測到未收錄」的日期，算出每個網址卡了幾天。
 * 收錄成功即清掉起算日——之後若又掉出索引會重新起算，不沿用舊天數。
 */
function updateHistory(history, states) {
  const d = today();
  const live = new Set(states.map((s) => s.url));
  for (const { url, state, lastCrawl } of states) {
    const rec = history.urls[url] ?? {};
    history.urls[url] = state === INDEXED
      ? { state, lastCrawl, lastSeen: d, firstNotIndexed: null }
      : { state, lastCrawl, lastSeen: d, firstNotIndexed: rec.firstNotIndexed ?? d };
  }
  // 已從 sitemap 移除的網址不再追蹤，避免歷史檔無限長大
  for (const u of Object.keys(history.urls)) if (!live.has(u)) delete history.urls[u];
  return history;
}

function stuckList(history) {
  const d = today();
  return Object.entries(history.urls)
    .filter(([, r]) => r.firstNotIndexed && daysBetween(r.firstNotIndexed, d) >= STUCK_DAYS)
    .map(([url, r]) => ({ url, days: daysBetween(r.firstNotIndexed, d), state: r.state, lastCrawl: r.lastCrawl }))
    .sort((a, b) => b.days - a.days);
}

async function slackPost(text) {
  const token = readFileSync(SLACK_TOKEN_FILE, 'utf8').trim();
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text, unfurl_links: false }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack：${data.error}`);
}

/**
 * 只在「卡住清單有變化」時告警——每天重貼同一份清單會被當背景噪音略過，
 * 那等於回到「靠 GSC 寄信才發現」的原點。
 */
async function maybeAlert(history, stuck) {
  const urls = stuck.map((s) => s.url).sort();
  const prev = (history.lastAlert?.urls ?? []).slice().sort();
  if (!urls.length || JSON.stringify(urls) === JSON.stringify(prev)) {
    if (urls.length) console.log(`[index-watch] 卡住 ${urls.length} 筆，與上次告警相同 → 不重複發 Slack`);
    return;
  }
  const lines = stuck.slice(0, 15).map((s) =>
    `• ${s.url.replace(SITE, '')}（${s.days} 天・${s.state ?? '狀態未知'}${s.lastCrawl ? '' : '・從未被爬取'}）`);
  const more = stuck.length > 15 ? `\n…另有 ${stuck.length - 15} 筆` : '';
  const text = `:mag: *twdro.net 收錄卡關* — ${stuck.length} 個網址已連續 ${STUCK_DAYS} 天以上未編入索引\n${lines.join('\n')}${more}\n\n` +
    `_lastCrawl 為空＝Google 從未爬取，多半是新站爬取預算不足、非站台故障；推送 Indexing API 對這類頁無效（已驗證）。_\n` +
    `_可施力處：從首頁與高流量頁增加指向這些頁的實質內鏈與外部曝光。詳見 scripts/index-watch.mjs 檔頭。_`;
  try {
    await slackPost(text);
    history.lastAlert = { date: today(), urls };
    console.log(`[index-watch] 已發 Slack 告警（${stuck.length} 筆）`);
  } catch (e) {
    console.log(`[index-watch] ⚠️ Slack 告警失敗：${e.message}`);
  }
}

/**
 * 推送並回報失敗。回 {ok, failures, quotaHit}。
 *
 * quotaHit 要獨立辨識，因為 Indexing API 的每日 200 配額是 **GCP 專案層級、跨站共用**的
 * （全部站台共用 SA ga4-insights@yaocare / project yaocare，2026-07-28 由實際的 quota 錯誤訊息
 * 證實）。日常用量 folk.tw 112＋arthurs.tw 31＋twdro ~25＋sutta.io 3 ≈ 171/200 並未超標；
 * 該日觸頂是人工除錯時額外推了 43 筆造成的，不是常態。保留這個判斷是因為 seo-collect 對失敗
 * 只 `catch { fail++ }` 計數、不告警——真的觸頂時沒有任何人看得見。
 */
async function push(targets) {
  const token = await getAccessToken('https://www.googleapis.com/auth/indexing');
  let ok = 0; const failures = []; let quotaHit = false;
  for (const u of targets) {
    try { await publish(token, u); ok++; }
    catch (e) {
      failures.push(`${u}：${e.message}`);
      if (/quota/i.test(e.message)) quotaHit = true;
    }
  }
  console.log(`[index-watch] 推送完成：成功 ${ok}／失敗 ${failures.length}${quotaHit ? '（撞到跨站共用日配額）' : ''}`);
  failures.slice(0, 10).forEach((f) => console.log(`  ✗ ${f}`));
  if (failures.length) process.exitCode = 1;
  return { ok, failures, quotaHit };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportOnly = args.includes('--report');
  const explicit = args.filter((a) => !a.startsWith('--')).map(normalizeUrl);

  // 指定網址／--all：略過掃描與監測，單純推送
  if (explicit.length || args.includes('--all')) {
    let targets = explicit.length ? [...new Set(explicit)] : await sitemapUrls();
    console.log(`[index-watch] ${explicit.length ? '指定網址' : '--all：sitemap 全部'} ${targets.length} 筆`);
    if (targets.length > MAX_PER_RUN) {
      console.log(`[index-watch] ⚠️ 超過單次上限 ${MAX_PER_RUN}，截斷`);
      targets = targets.slice(0, MAX_PER_RUN);
    }
    if (dryRun) { targets.forEach((u) => console.log(`  (dry-run) ${u}`)); return; }
    await push(targets);
    return;
  }

  const urls = await sitemapUrls();
  const states = await inspectAll(urls);

  const tally = states.reduce((m, s) => ((m[s.state ?? '(查詢失敗)'] = (m[s.state ?? '(查詢失敗)'] || 0) + 1), m), {});
  console.log(`[index-watch] sitemap ${urls.length} 筆：` + Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('、'));

  const history = updateHistory(loadHistory(), states);
  const stuck = stuckList(history);
  if (stuck.length) {
    console.log(`[index-watch] 卡住 ≥${STUCK_DAYS} 天：${stuck.length} 筆`);
    stuck.slice(0, 10).forEach((s) =>
      console.log(`  ⏳ ${s.days} 天 ${s.url.replace(SITE, '')}（${s.state}${s.lastCrawl ? '' : '・從未被爬取'}）`));
  }

  if (reportOnly) { saveHistory(history); return; }

  const notIndexed = states.filter((s) => s.state !== INDEXED).map((s) => s.url);
  let targets = [...new Set([...notIndexed, ...FLAGSHIP.map((p) => SITE + p)])];
  console.log(`[index-watch] 未收錄 ${notIndexed.length} 筆＋旗艦頁保底 → 推送 ${targets.length} 筆`);
  if (targets.length > MAX_PER_RUN) {
    console.log(`[index-watch] ⚠️ 超過單次上限 ${MAX_PER_RUN}，截斷（未推送 ${targets.length - MAX_PER_RUN} 筆，下次執行會再進清單）`);
    targets = targets.slice(0, MAX_PER_RUN);
  }

  let result = null;
  if (dryRun) targets.forEach((u) => console.log(`  (dry-run) ${u}`));
  else result = await push(targets);

  // 配額用罄＝今天的推送有一部分沒送出去，且原因在別站。這種失敗必須看得見，
  // 否則會誤以為「推了卻沒用」而去改錯的東西（過去擴清單擴了三輪就是這樣）。
  if (result?.quotaHit) {
    await slackPost(
      `:warning: *twdro.net index-watch 撞到 Indexing API 日配額*（成功 ${result.ok}／失敗 ${result.failures.length}）\n` +
      `每日 200 筆是 **GCP 專案 yaocare 跨站共用**，非本站專屬；本站有 ${result.failures.length} 筆未送出。\n` +
      `_先查當日各站實際用量（日常合計約 171/200）再決定處理方向：調降用量最大的站，或另開 GCP 專案與服務帳號。_`,
    ).catch((e) => console.log(`[index-watch] ⚠️ 配額告警發送失敗：${e.message}`));
  }

  await maybeAlert(history, stuck);
  saveHistory(history);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
