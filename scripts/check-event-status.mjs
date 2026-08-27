#!/usr/bin/env node
// 賽事資料的新鮮度與可追溯性檢查。
//
// 為什麼（2026-08-27）：站上最有時效性的東西是賽事，而賽事資料會用兩種無聲的方式壞掉。
//
// 1. **狀態沒有跟著日期走。** `status` 是人工／pipeline 維護的事實欄位，畫面上的分組
//    （還能報名／即將舉行／已結束）也依它而非日期——這是刻意的，因為日期會過而狀態才是
//    我們確認過的事。代價是沒有人更新時，一場 8/8 舉行的比賽到了 8/27 還掛著「已公告」，
//    讀者看到的是「即將舉行」。實例就是這一支寫出來的原因：第三屆臺灣教育科技盃新北場
//    賽期 2026-08-08、狀態仍是 announced，而它是 GSC 近 90 天曝光第二高的頁（18 次、pos 6.9）。
//
// 2. **零來源的頁面沒有任何警示。** `verification` 原本只在 SourceBlock 裡顯示，而
//    SourceBlock 只在「有來源」時才渲染——於是最沒有依據的頁面反而最安靜。
//
// 兩種都不會讓 build 失敗、不會讓測試轉紅，只有真的去讀的人才知道。
//
// 用法：
//   node scripts/check-event-status.mjs            # 有問題則 exit 1
//   node scripts/check-event-status.mjs --quiet    # 只印問題
//
// CI 設計：比照 check-source-links.mjs 跑在獨立 job，**不擋部署**。
// 賽事資料過期是要人去查證的事，不該讓整個網站發不出去；但它會讓 workflow 紅掉、
// 問題看得見。要靜音某一筆＝去把資料修好，這支刻意不提供豁免清單。

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVENT_DIR = join(REPO, 'src/content/events');
const QUIET = process.argv.includes('--quiet');

// 還沒發生的狀態。賽期已過卻仍是這幾種，就是沒人更新。
const FORWARD_LOOKING = ['announced', 'registration_open', 'registration_closed', 'ongoing', 'postponed'];
// 草稿不對外顯示，不列入檢查（pipeline 每天都會產生新的草稿）。
const SKIP = ['draft'];

const field = (raw, key, indented = false) =>
  raw.match(new RegExp(`${indented ? '^\\s+' : '^'}${key}:\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

const events = readdirSync(EVENT_DIR)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => {
    const raw = readFileSync(join(EVENT_DIR, f), 'utf8');
    return {
      slug: f.replace(/\.yml$/, ''),
      title: field(raw, 'title') ?? f,
      status: field(raw, 'status'),
      verification: field(raw, 'verification'),
      start: field(raw, 'event_start', true),
      end: field(raw, 'event_end', true),
      sourceCount: (raw.match(/^\s+- type:/gm) ?? []).length,
      hasSources: /^sources:/m.test(raw),
    };
  })
  .filter((e) => !SKIP.includes(e.status));

const now = today();
const stale = events.filter((e) => {
  if (!FORWARD_LOOKING.includes(e.status)) return false;
  const last = e.end || e.start;
  return last && last < now;
});
const unsourced = events.filter((e) => !e.hasSources || e.sourceCount === 0);

const line = (e, extra) => `  ${e.slug}（${e.status}${extra}）\n      ${e.title}`;

if (stale.length) {
  console.log(`\n⚠️  賽期已過但狀態仍是「還沒發生」（${stale.length}）——畫面會把它排進「即將舉行」：`);
  for (const e of stale) console.log(line(e, `・賽期 ${e.end || e.start}・今天 ${now}`));
  console.log('   修法：查證後把 status 改成 completed／results_pending／cancelled 之一，並補上來源。');
}
if (unsourced.length) {
  console.log(`\n⚠️  沒有任何來源可追溯（${unsourced.length}）——這幾頁的每一句話目前都沒有出處：`);
  for (const e of unsourced) console.log(line(e, `・verification: ${e.verification ?? '未標'}`));
  console.log('   修法：補 sources（含 url／retrieved_at／trust_level）；查不到就別讓那些欄位停在推測值。');
}

if (!stale.length && !unsourced.length) {
  if (!QUIET) console.log(`✅ ${events.length} 場公開賽事：狀態與賽期一致，且每一場都附得起來源。`);
  process.exit(0);
}
console.log(`\n共 ${events.length} 場公開賽事，${stale.length} 場狀態過期、${unsourced.length} 場無來源。`);
process.exit(1);
