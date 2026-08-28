import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { CITY_SLUGS, citySlug, normalizeCity, cityFromSlug } from '../src/lib/geo.mjs';

describe('縣市 slug', () => {
  it('臺／台兩種寫法都對得上同一個 slug', () => {
    expect(citySlug('臺中市')).toBe('taichung');
    expect(citySlug('台中市')).toBe('taichung');
    expect(normalizeCity('台東縣')).toBe('臺東縣');
  });

  it('slug 唯一且可雙向對照', () => {
    const slugs = Object.values(CITY_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [name, slug] of Object.entries(CITY_SLUGS)) expect(cityFromSlug(slug)).toBe(name);
  });

  it('資料裡出現的每個縣市都在對照表上——漏一個就是漏一頁', () => {
    // 縣市頁是自動產生的：對照表沒有的縣市不會有頁，而那種漏法在畫面上看不出來。
    const missing = new Set<string>();
    for (const f of readdirSync('src/content/events').filter((x) => x.endsWith('.yml'))) {
      const raw = readFileSync(`src/content/events/${f}`, 'utf8');
      if (/^status:\s*draft/m.test(raw)) continue;
      // 國外賽事的 city 是「全州」「仁川」這種外國城市，本來就不在臺灣縣市對照表裡。
      // 用 country 欄位判斷（臺灣的賽事不填 country），不是靠猜城市名（2026-08-28）。
      if (/^country:\s*\S/m.test(raw)) continue;
      const city = raw.match(/^\s+city:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      if (city && !citySlug(city)) missing.add(city);
    }
    expect([...missing]).toEqual([]);
  });
});

// 前置：需先執行 `npm run build`
//
// 縣市頁是自動產生的，所以它的壞法是「整層安靜地消失」：某個縣市沒有頁、或有頁但沒有入口，
// 畫面上都看不出來。/organizations/ 卡在「從未被爬取」38 天就是因為只有頁尾樣板連結。
describe('縣市彙整頁', () => {
  const eventsIndex = readFileSync('dist/events/index.html', 'utf8');
  const humanSitemap = readFileSync('dist/sitemap/index.html', 'utf8');
  const xmlSitemap = readFileSync('dist/sitemap-0.xml', 'utf8');

  const citiesInData = [...new Set(
    readdirSync('src/content/events')
      .filter((f) => f.endsWith('.yml'))
      .map((f) => readFileSync(`src/content/events/${f}`, 'utf8'))
      .filter((raw) => !/^status:\s*draft/m.test(raw))
      .map((raw) => raw.match(/^\s+city:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, ''))
      .map((c) => (c ? citySlug(c) : null))
      .filter((s): s is string => !!s),
  )];

  it('資料裡的每個縣市都產得出頁', () => {
    expect(citiesInData.length).toBeGreaterThan(5);
    for (const slug of citiesInData) {
      expect(existsSync(`dist/events/city/${slug}/index.html`), slug).toBe(true);
    }
  });

  it('每一頁都有入口：賽事索引、人類版網站地圖、XML sitemap 三處都在', () => {
    for (const slug of citiesInData) {
      const href = `/events/city/${slug}/`;
      expect(eventsIndex, `${slug} 沒出現在 /events/`).toContain(href);
      expect(humanSitemap, `${slug} 沒出現在人類版網站地圖`).toContain(href);
      expect(xmlSitemap, `${slug} 沒進 XML sitemap`).toContain(`https://twdro.net${href}`);
    }
  });

  it('賽事明細頁的地點連得到所屬縣市頁', () => {
    const html = readFileSync('dist/events/2026-taichung-city-cup/index.html', 'utf8');
    expect(html).toContain('/events/city/taichung/');
  });
});
