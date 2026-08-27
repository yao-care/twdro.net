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
//   node scripts/check-source-links.mjs            # 全查，有未標註的失效則 exit 1
//   node scripts/check-source-links.mjs --quiet    # 只印問題
//
// CI 設計：這支跑在獨立的 job，**不擋部署**。第三方網站偶發不穩不該讓網站發不出去，
// 但它會讓該 job 紅掉、workflow 整體標記失敗並寄通知——問題看得見，發布不受制於人。

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(REPO, 'src/content');

// 學校與政府網站常擋非瀏覽器 UA，不帶會拿到一堆假的 403。
import { promises as dns } from 'node:dns';

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

// 連線層失敗（status 0：fetch failed／DNS／timeout）**不等於連結失效**。
// 2026-08-03 實例：新竹縣文興國小等多個學校網站，從本機（臺灣境內出口）IPv4 實測回 200，
// 但 GitHub Actions runner 一律 fetch failed——TANet 上不少校網會過濾境外／雲端 IP。
// 先前把這類一概判成「連結失效」，結果 deploy workflow 天天掛紅、內容其實好好的，
// 久了就沒人看這個檢查了（那才是真正的損失）。
//
// 判準：**DNS 還解析得出來，就不算死**。網域還在對方手上，頁面真的被移除時會回 404／410，
// 那個才是 link rot 的訊號，仍然是硬失敗。只有連網域都消失（NXDOMAIN）才算確定失效。
//
// ⚠️ 2026-08-27 修：原本的 catch 把「查不到」與「查詢失敗」一起吞掉，一律回 false ＝判定失效。
// 那天 CI 就把新竹縣文興國小（wxes.hcc.edu.tw）判成連結失效——那個網域好好的，
// A 與 AAAA 都有紀錄，只是 TANet 的權威伺服器對境外／雲端查詢時好時壞
// （本機實測同一個名字也會 `communications error ... timed out`）。
// 這種誤判的代價不是多一行紅字：**它會逼人去資料裡加 `unavailable_since`，
// 而那個欄位會在頁面上對讀者說「原公告已下架」——把一個活著的來源標成死的。**
// 所以只有明確的「這個名字不存在」（ENOTFOUND／EAI_NONAME）才算網域消失；
// 其餘（EAI_AGAIN、逾時、暫時性失敗）一律當成「這台機器查不到」，不是證據。
const GONE_CODES = new Set(['ENOTFOUND', 'EAI_NONAME', 'ENODATA']);

async function domainStillExists(url) {
  let hostname;
  try {
    ({ hostname } = new URL(url));
  } catch {
    return false;   // 連網址都解析不了，那是我們自己的資料寫壞了
  }
  try {
    await dns.lookup(hostname, { all: true });
    return true;
  } catch (e) {
    // 明確的 NXDOMAIN → 網域真的沒了；其餘是解析不到，不能當成失效的證據。
    return !GONE_CODES.has(e?.code);
  }
}

const quiet = process.argv.includes('--quiet');

/**
 * 掃出所有來源網址，並記下哪些已在資料裡標註 unavailable_since。
 *
 * 標註直接讀自內容檔，不另外維護一份清單——清單會與資料脫節，而且「這個來源掛了」
 * 本來就是資料的一部分（畫面上也要標明「原公告已下架」）。單一真實來源。
 */
function collectUrls() {
  /** @type {Map<string, {files: string[], unavailableSince: string|null}>} */
  const urls = new Map();
  const add = (u, rel, unavailableSince) => {
    if (!/^https?:\/\//.test(u)) return;
    if (!urls.has(u)) urls.set(u, { files: [], unavailableSince: null });
    const e = urls.get(u);
    e.files.push(rel);
    if (unavailableSince) e.unavailableSince = unavailableSince;
  };

  for (const dir of readdirSync(CONTENT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const d = join(CONTENT, dir.name);
    for (const file of readdirSync(d)) {
      if (!/\.(ya?ml|md)$/.test(file)) continue;
      const rel = `src/content/${dir.name}/${file}`;
      const text = readFileSync(join(d, file), 'utf8');

      // 先按「- type:」切出各筆來源，才能把 url 與同一筆的 unavailable_since 對起來
      const blocks = text.match(/\n {2}- type:[\s\S]*?(?=\n {2}- type:|\n[a-z_]+:|$)/g) ?? [];
      const seen = new Set();
      for (const blk of blocks) {
        const u = blk.match(/\n\s+url:\s*(\S+)/)?.[1]?.replace(/^["']|["']$/g, '');
        if (!u) continue;
        seen.add(u);
        add(u, rel, blk.match(/\n\s+unavailable_since:\s*"?([\d-]+)"?/)?.[1] ?? null);
      }
      // 落在來源區塊外的 url（例如單位官網），一併檢查
      for (const m of text.matchAll(/\n\s+url:\s*(\S+)/g)) {
        const u = m[1].replace(/^["']|["']$/g, '');
        if (!seen.has(u)) add(u, rel, null);
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

const urls = collectUrls();
const entries = [...urls.entries()];
if (!quiet) console.log(`檢查 ${entries.length} 個來源網址…\n`);

const results = await mapLimit(entries, CONCURRENCY, async ([url, meta]) => {
  const { status, error } = await probe(url);
  return { url, files: meta.files, unavailableSince: meta.unavailableSince, status, error };
});

const dead = [];
const blocked = [];
const unverifiable = [];
const knownDead = [];
const revived = [];
const unreachable = [];

for (const r of results) {
  const ok = r.status >= 200 && r.status < 400;
  if (ok) {
    // 標了「已下架」卻又活過來——通常是對方換版後把舊網址接回去了，該把標註拿掉，
    // 否則畫面會一直對讀者說謊。
    if (r.unavailableSince) revived.push(r);
    continue;
  }
  if (isUnverifiable(r.url)) { unverifiable.push(r); continue; }
  if (BOT_BLOCKED.has(r.status)) { blocked.push(r); continue; }
  // 連不上但網域還在 → 這台機器到不了，不是連結死了（理由見 domainStillExists 註解）。
  if (r.status === 0 && await domainStillExists(r.url)) { unreachable.push(r); continue; }
  (r.unavailableSince ? knownDead : dead).push(r);
}

const show = (r) => `  ${r.status || r.error}  ${r.url}\n      ← ${[...new Set(r.files)].join('、')}`;

if (knownDead.length) {
  console.log(`⚠️  已標註「原公告已下架」、仍在找替代來源（${knownDead.length}）：`);
  for (const r of knownDead) console.log(`${show(r)}\n      unavailable_since: ${r.unavailableSince}`);
  console.log('');
}

if (revived.length) {
  console.log(`♻️  標了 unavailable_since 但網址已恢復（${revived.length}）——請把該欄位刪掉：`);
  for (const r of revived) console.log(show(r));
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

if (unreachable.length) {
  console.log(`ℹ️  這台機器連不上，網域仍存在（${unreachable.length}）——常見於會過濾境外／雲端 IP 的校網：`);
  for (const r of unreachable) console.log(show(r));
  console.log('   （非連結失效。頁面若真被移除會回 404／410，那才會列進下面的失效清單。）\n');
}

if (dead.length) {
  console.log(`❌ 連結失效（${dead.length}）：`);
  for (const r of dead) console.log(show(r));
  console.log('\n請找替代網址並更新對應的 src/content 檔案。若確認原始公告已永久下架、');
  console.log('又找不到替代來源，在該筆來源加上 unavailable_since: "YYYY-MM-DD"——');
  console.log('畫面會標明「原公告已下架」，這裡也會降級成提醒。');
  process.exit(1);
}

if (!quiet) {
  const okCount = results.length - dead.length - blocked.length - unverifiable.length - knownDead.length - unreachable.length;
  const notes = [
    blocked.length && `${blocked.length} 個被擋（非失效）`,
    unverifiable.length && `${unverifiable.length} 個無法自動驗證`,
    unreachable.length && `${unreachable.length} 個本機連不上（網域仍在）`,
    knownDead.length && `${knownDead.length} 個已知失效待處理`,
  ].filter(Boolean);
  console.log(`✅ ${okCount} 個網址正常${notes.length ? `，${notes.join('、')}` : ''}`);
}
