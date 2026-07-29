#!/usr/bin/env node
// 檢查 src/content 裡所有來源網址是否還活著。
//
// 為什麼（2026-07-29）：站上每一筆資料都標了來源網址，那是本站對讀者與主辦單位的核心
// 承諾。但學校公告下架、換網址是常態——手動抽查一次就發現 37 個來源裡有 4 個是 404，
// 其中 /events/2026-skycup-newtaipei/ 的兩個來源全掛，等於那頁完全沒有可查證的出處。
// 這種壞法無聲無息：頁面照樣渲染、build 照樣過、測試照樣綠，只有真的去點的人才發現，
// 而會去點的正是我們最想說服的那群人（協會、學校、主辦單位）。
//
// 那 4 筆裡有 1 筆根本不是連結失效，是我們資料打錯字（網址少了一個「盃」字）——
// 這種錯更需要機制擋，因為它從外觀完全看不出來。
//
// 用法：
//   node scripts/check-source-links.mjs            # 全查，有失效則 exit 1
//   node scripts/check-source-links.mjs --quiet    # 只印問題
//
// CI 設計：這支跑在獨立的 job，**不擋部署**。第三方網站偶發不穩不該讓網站發不出去，
// 但它會讓該 job 紅掉、workflow 整體標記失敗並寄通知——問題看得見，發布不受制於人。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(REPO, 'src/content');
const ALLOWLIST_FILE = join(REPO, 'scripts/known-dead-links.json');

// 學校與政府網站常擋非瀏覽器 UA，不帶會拿到一堆假的 403。
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 25_000;
const RETRIES = 2;
const CONCURRENCY = 6;

// 這些狀態代表「對方擋機器人」，不是連結壞掉。降級為提醒，不算失敗。
const BOT_BLOCKED = new Set([401, 403, 405, 406, 429]);

// 這些站對未登入的機器請求一律回 400/302，無法用程式判斷連結死活——回什麼都不代表
// 內容還在或不在。列在這裡是誠實標記「這類來源本檢查驗不了」，不是把問題掃到地毯下：
// 它們會出現在「無法自動驗證」區塊，提醒人工複查。
const UNVERIFIABLE_HOSTS = ['facebook.com', 'instagram.com', 'threads.com', 'threads.net'];
const isUnverifiable = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return UNVERIFIABLE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

const quiet = process.argv.includes('--quiet');

function collectUrls() {
  /** @type {Map<string, string[]>} url → 引用它的檔案 */
  const urls = new Map();
  for (const dir of readdirSync(CONTENT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const d = join(CONTENT, dir.name);
    for (const file of readdirSync(d)) {
      if (!/\.(ya?ml|md)$/.test(file)) continue;
      const rel = `src/content/${dir.name}/${file}`;
      for (const m of readFileSync(join(d, file), 'utf8').matchAll(/\n\s+url:\s*(\S+)/g)) {
        const u = m[1].replace(/^["']|["']$/g, '');
        if (!/^https?:\/\//.test(u)) continue;
        if (!urls.has(u)) urls.set(u, []);
        urls.get(u).push(rel);
      }
    }
  }
  return urls;
}

async function probe(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      // 有些站對 HEAD 回 405 卻能正常 GET，所以直接用 GET；只讀狀態不讀內容。
      const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA }, signal: ac.signal });
      return { status: res.status };
    } catch (e) {
      if (attempt === RETRIES) return { status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

const allowlist = existsSync(ALLOWLIST_FILE)
  ? JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8'))
  : { known_dead: [] };
const allowed = new Map(allowlist.known_dead.map((e) => [e.url, e]));

const urls = collectUrls();
const entries = [...urls.entries()];
if (!quiet) console.log(`檢查 ${entries.length} 個來源網址…\n`);

const results = await mapLimit(entries, CONCURRENCY, async ([url, files]) => {
  const { status, error } = await probe(url);
  return { url, files, status, error };
});

const dead = [];
const blocked = [];
const unverifiable = [];
const knownDead = [];

for (const r of results) {
  const ok = r.status >= 200 && r.status < 400;
  if (ok) continue;
  if (isUnverifiable(r.url)) { unverifiable.push(r); continue; }
  if (BOT_BLOCKED.has(r.status)) { blocked.push(r); continue; }
  (allowed.has(r.url) ? knownDead : dead).push(r);
}

const show = (r) => `  ${r.status || r.error}  ${r.url}\n      ← ${[...new Set(r.files)].join('、')}`;

if (knownDead.length) {
  console.log(`⚠️  已知失效、仍待處理（${knownDead.length}）——記在 scripts/known-dead-links.json：`);
  for (const r of knownDead) {
    console.log(show(r));
    console.log(`      原因：${allowed.get(r.url).reason}`);
  }
  console.log('');
}

if (blocked.length && !quiet) {
  console.log(`ℹ️  對方擋機器人，非連結失效（${blocked.length}）：`);
  for (const r of blocked) console.log(show(r));
  console.log('');
}

if (unverifiable.length && !quiet) {
  console.log(`ℹ️  無法自動驗證，需人工複查（${unverifiable.length}）——社群平台對機器請求一律拒絕：`);
  for (const r of unverifiable) console.log(show(r));
  console.log('');
}

if (dead.length) {
  console.log(`❌ 連結失效（${dead.length}）：`);
  for (const r of dead) console.log(show(r));
  console.log('\n請找替代網址並更新對應的 src/content 檔案。若確認原始公告已永久下架，');
  console.log('把該網址加進 scripts/known-dead-links.json 並寫明原因，它會降級成提醒。');
  process.exit(1);
}

if (!quiet) {
  const okCount = results.length - dead.length - blocked.length - unverifiable.length - knownDead.length;
  const notes = [
    blocked.length && `${blocked.length} 個被擋（非失效）`,
    unverifiable.length && `${unverifiable.length} 個無法自動驗證`,
    knownDead.length && `${knownDead.length} 個已知失效待處理`,
  ].filter(Boolean);
  console.log(`✅ ${okCount} 個網址正常${notes.length ? `，${notes.join('、')}` : ''}`);
}
