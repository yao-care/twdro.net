import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// lastmod.mjs 是給 astro.config 直接載入的純 JS。tsconfig 繼承 astro/tsconfigs/strict
// （含 allowJs），TS 會直接從該檔推導型別，**不需要** @ts-expect-error——留著反而讓
// astro check 報 ts(2578) unused directive（2026-08-02 移除）。
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

  // 2026-07-28 補：第一版只認內容自帶的日期欄位，結果 venues（4 檔）、organizations（8 檔）
  // 這些沒有日期欄位的集合，以及 src/pages 下的靜態頁，全部拿不到 lastmod——而
  // /venues/、/organizations/、/organizations/oursteam/、/equipment/compliance-check/
  // 正好都卡在未收錄清單裡，等於漏掉的剛好就是最需要重抓訊號的那幾頁。現以 git commit
  // 日期補上退路。
  it('沒有日期欄位的集合，以 git commit 日期補上', () => {
    expect(map.get('/venues/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(map.get('/organizations/oursteam/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('沒有內容檔的靜態頁也有日期', () => {
    expect(map.get('/equipment/compliance-check/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(map.get('/about/privacy/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('內容自帶的查核日優先於 git 日期', () => {
    // 2026-08-03：原本寫死 '2026-07-28'，導致每次更新該文的 updated_at 都假性失敗
    // （這次是加入縣市選拔賽那一列時踩到）。斷言的用意是「以 frontmatter 為準」，
    // 所以改成直接讀 frontmatter 比對——用意不變，但不再綁死在某一天。
    const fm = readFileSync('src/content/learn/taiwan-competitions-overview.md', 'utf8')
      .match(/^updated_at:\s*"?(\d{4}-\d{2}-\d{2})"?$/m)?.[1];
    expect(fm).toBeTruthy();
    expect(map.get('/learn/taiwan-competitions-overview/')).toBe(fm);
  });

  it('動態路由檔（[slug].astro）不會被當成靜態頁混進來', () => {
    expect(map.has('/learn/[...slug]/')).toBe(false);
    expect(map.has('/events/[slug]/')).toBe(false);
  });
});

// 前置：需先執行 `npm run build`
describe('sitemap 產物', () => {
  const path = 'dist/sitemap-0.xml';
  const xml = existsSync(path) ? readFileSync(path, 'utf8') : '';

  it('sitemap 存在', () => {
    expect(xml.length).toBeGreaterThan(0);
  });

  it('每一個網址都帶 lastmod（漏掉的往往就是最需要重抓的那幾頁）', () => {
    const missing = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(.*?)<\/url>/g)]
      .filter((m) => !m[2].includes('<lastmod>'))
      .map((m) => m[1]);
    expect(missing, `這些網址缺 lastmod：\n${missing.join('\n')}`).toEqual([]);
  });

  it('lastmod 不是全站同一個日期（那等於蓋建置時間的假訊號）', () => {
    const dates = new Set((xml.match(/<lastmod>(\d{4}-\d{2}-\d{2})/g) ?? []).map((m) => m.slice(9)));
    expect(dates.size).toBeGreaterThan(1);
  });

  it('IndexNow 金鑰檔隨站部署', () => {
    expect(existsSync('dist/be644c81fe9010bea60de485d1544bf2.txt')).toBe(true);
  });
});
