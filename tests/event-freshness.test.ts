import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
//
// 賽事資料會用兩種無聲的方式壞掉，兩種都不會讓 build 失敗、不會讓別的測試轉紅：
//   1. 賽期已過但 status 還停在「還沒發生」→ 畫面把它排進「即將舉行」。
//   2. 整頁沒有任何來源 → 而 verification 原本只在有來源時才顯示，最沒依據的頁面最安靜。
// 對讀者的補救在畫面上（卡片標記、頁面警語），對維護者的補救在 CI
// （scripts/check-event-status.mjs）。這裡守的是畫面那一半還在。

const EVENT_DIR = 'src/content/events';
const field = (raw: string, key: string, indented = false) =>
  raw.match(new RegExp(`${indented ? '^\\s+' : '^'}${key}:\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;

const events = readdirSync(EVENT_DIR).filter((f) => f.endsWith('.yml')).map((f) => {
  const raw = readFileSync(`${EVENT_DIR}/${f}`, 'utf8');
  return {
    slug: f.replace(/\.yml$/, ''),
    status: field(raw, 'status') ?? '',
    start: field(raw, 'event_start', true),
    end: field(raw, 'event_end', true),
    hasSources: /^sources:/m.test(raw),
    verification: field(raw, 'verification'),
  };
}).filter((e) => e.status !== 'draft');

const eventsIndex = readFileSync('dist/events/index.html', 'utf8');

describe('賽事卡片的過期標記', () => {
  it('每張卡片都帶得出判斷所需的資料（結束日優先，沒有才用開始日）', () => {
    const lasts = [...eventsIndex.matchAll(/data-event-last="([^"]*)"\s+data-event-status="([^"]*)"/g)];
    // 沒有日期的賽事本來就標不出過期，屬性也不會渲染——拿有日期的那些來比。
    const dated = events.filter((e) => e.end || e.start);
    expect(dated.length).toBeGreaterThan(0);
    expect(lasts.length).toBe(dated.length);
    for (const e of events) {
      const expected = e.end || e.start;
      if (!expected) continue;
      expect(lasts.some(([, last, status]) => last === expected && status === e.status)).toBe(true);
    }
  });

  it('跨期賽事用結束日判斷，不會在開賽隔天就被標成過期', () => {
    // 教育部分區賽是 7/1–8/31 的跨期賽事。只看開始日的話，7/2 就會被標「賽期已過」。
    const spanning = events.find((e) => e.end && e.start && e.end !== e.start);
    expect(spanning).toBeTruthy();
    expect(eventsIndex).toContain(`data-event-last="${spanning!.end}"`);
  });
});

describe('沒有來源或標為過期的賽事頁', () => {
  it('會直接對讀者說明資料狀態，而不是安靜地什麼都不顯示', () => {
    const suspect = events.filter((e) => !e.hasSources || e.verification === 'outdated');
    expect(suspect.length).toBeGreaterThan(0);   // 目前確實有，沒有的話這條測試也該重寫
    for (const e of suspect) {
      const html = readFileSync(`dist/events/${e.slug}/index.html`, 'utf8');
      expect(html, `${e.slug} 少了資料狀態警語`).toContain('這一頁的資料狀態是');
    }
  });

  it('有來源且不過期的賽事頁不會出現那段警語（別對正常頁面喊狼來了）', () => {
    const clean = events.find((e) => e.hasSources && e.verification !== 'outdated');
    expect(clean).toBeTruthy();
    const html = readFileSync(`dist/events/${clean!.slug}/index.html`, 'utf8');
    expect(html).not.toContain('這一頁的資料狀態是');
  });
});

describe('尚未舉行的賽事會印出我方最後確認日', () => {
  it('天穹盃臺南戰印得出確認日（那一場已因颱風延期過一次）', () => {
    const raw = readFileSync(`${EVENT_DIR}/2026-skycup-tainan.yml`, 'utf8');
    const retrieved = [...raw.matchAll(/retrieved_at:\s*"?([\d-]+)"?/g)].map((m) => m[1]).sort().at(-1);
    expect(retrieved).toBeTruthy();
    const html = readFileSync('dist/events/2026-skycup-tainan/index.html', 'utf8');
    expect(html).toContain('event-freshness');
    expect(html).toContain(retrieved!);
    expect(html).toContain('出發或報名前請向主辦單位再確認一次');
  });

  it('已結束的賽事不印（那句話對過去式的賽事沒有意義）', () => {
    const done = events.find((e) => e.status === 'completed' && e.hasSources);
    const html = readFileSync(`dist/events/${done!.slug}/index.html`, 'utf8');
    expect(html).not.toContain('class="event-freshness"');
  });
});
