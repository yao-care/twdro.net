import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error — lastmod.mjs 是給 astro.config 直接載入的純 JS，沒有型別宣告
import { extractDate, buildLastmodMap } from '../src/lib/lastmod.mjs';

// 為什麼有這組測試（2026-07-28）：
//
// 建站時 sitemap 的 83 個網址一個 <lastmod> 都沒有。搭配 7/19～21 的 trailingSlash 設定
// 錯誤（見 trailing-slash.test.ts），帶斜線網址對 Google 是全新網址、得重新排隊，而
// sitemap 又沒給任何「這頁何時更新」的訊號——到 7/28 仍有 16 頁停在「已找到／尚未建立
// 索引」，包含 /learn/ 與 /learn/what-is-drone-soccer/（全站主題定義頁）。
//
// lastmod 一旦掉回全空、或退化成「全站蓋同一個建置日期」的假訊號，這個病就會無聲復發，
// 所以把它釘在建置產物層。

const TODAY = new Date().toISOString().slice(0, 10);

describe('extractDate', () => {
  it('取白名單欄位的最大值', () => {
    expect(extractDate('updated_at: "2026-07-20"\nretrieved_at: "2026-07-24"')).toBe('2026-07-24');
  });
  it('忽略未來日期欄位（event_start）與他方發布日（published_at）', () => {
    // 只有 retrieved_at 該被採用；event_start 是未來賽期，published_at 是對方發布日
    const text = 'event_start: "2027-03-01"\npublished_at: "2020-01-01"\nretrieved_at: "2026-07-19"';
    expect(extractDate(text)).toBe('2026-07-19');
  });
  it('沒有任何可信日期時回 null', () => {
    expect(extractDate('name: 某某隊\ncity: 臺北市')).toBeNull();
  });
});

describe('buildLastmodMap', () => {
  const map = buildLastmodMap('src/content', TODAY);

  it('教育文對應到明細頁與 /learn/ 索引頁', () => {
    expect(map.get('/learn/what-is-drone-soccer/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(map.get('/learn/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('索引頁日期不早於旗下任一條目', () => {
    const learnIndex = map.get('/learn/')!;
    for (const [path, date] of map) {
      if (path.startsWith('/learn/') && path !== '/learn/') expect(learnIndex >= date).toBe(true);
    }
  });

  it('首頁彙整全站，不早於任何一頁', () => {
    const home = map.get('/')!;
    for (const date of map.values()) expect(home >= date).toBe(true);
  });

  it('不產生未來日期', () => {
    for (const date of map.values()) expect(date <= TODAY).toBe(true);
  });

  it('沒有可信日期的頁面不進表（寧可缺 lastmod 也不給假訊號）', () => {
    expect(map.has('/about/privacy/')).toBe(false);
  });
});

// 前置：需先執行 `npm run build`
describe('sitemap 產物', () => {
  const path = 'dist/sitemap-0.xml';
  const xml = existsSync(path) ? readFileSync(path, 'utf8') : '';

  it('sitemap 存在', () => {
    expect(xml.length).toBeGreaterThan(0);
  });

  it('關鍵頁面都帶 lastmod', () => {
    for (const loc of ['https://twdro.net/', 'https://twdro.net/learn/', 'https://twdro.net/learn/what-is-drone-soccer/']) {
      const block = xml.match(new RegExp(`<url><loc>${loc.replace(/\//g, '\\/')}<\\/loc>[^]*?<\\/url>`))?.[0];
      expect(block, `${loc} 不在 sitemap 內`).toBeTruthy();
      expect(block, `${loc} 缺 lastmod`).toMatch(/<lastmod>/);
    }
  });

  it('lastmod 不是全站同一個日期（那等於蓋建置時間的假訊號）', () => {
    const dates = new Set((xml.match(/<lastmod>(\d{4}-\d{2}-\d{2})/g) ?? []).map((m) => m.slice(9)));
    expect(dates.size).toBeGreaterThan(1);
  });

  it('IndexNow 金鑰檔隨站部署', () => {
    expect(existsSync('dist/be644c81fe9010bea60de485d1544bf2.txt')).toBe(true);
  });
});
