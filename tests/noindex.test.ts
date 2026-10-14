import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  NOINDEX_PREFIXES, MEASURED_PREFIXES, decideNoindex, injectNoindex, pruneSitemap, mainTextLength,
} from '../src/lib/noindex.mjs';

// 稀薄頁 noindex＋移出 sitemap 的守門（規則與 2026-10-14 拍板理由見 src/lib/noindex.mjs）。
// 要防的退化有兩種：①有人把某個前綴改回收錄、或改模板時把 noindex 弄掉，稀薄頁又回到
// sitemap；②規則寫太寬，把 hub 頁（/venues/、/events/…）一起 noindex 掉。

describe('decideNoindex（純函式）', () => {
  it('固定前綴底下的明細頁一律 noindex', () => {
    for (const p of NOINDEX_PREFIXES) expect(decideNoindex(`${p}x/`, '').noindex).toBe(true);
  });
  it('前綴本身（hub 頁）不受影響', () => {
    for (const p of ['/', '/venues/', '/teams/', '/events/', '/events/series/', '/learn/', '/rules/']) {
      expect(decideNoindex(p, '<main>短</main>').noindex).toBe(false);
    }
  });
  it('系列頁依正文字數決定，編碼過的中文網址也認得', () => {
    const { minMainChars } = MEASURED_PREFIXES.find((m) => m.prefix === '/events/series/')!;
    const thin = `<main>${'字'.repeat(minMainChars - 1)}</main>`;
    const rich = `<main>${'字'.repeat(minMainChars)}</main>`;
    const path = `/events/series/${encodeURIComponent('天穹盃')}/`;
    expect(decideNoindex(path, thin).noindex).toBe(true);
    expect(decideNoindex(path, rich).noindex).toBe(false);
  });
  it('正文只量 <main>，不算 script／style 與標籤', () => {
    expect(mainTextLength('<nav>導覽很多字</nav><main><p>四個字啊</p><script>var x=1</script></main>')).toBe(4);
  });
  it('injectNoindex 用 noindex,follow，且不重複插', () => {
    const once = injectNoindex('<html><head><title>t</title></head></html>');
    expect(once).toContain('<meta name="robots" content="noindex,follow">');
    expect(injectNoindex(once)).toBe(once);
  });
  it('pruneSitemap 依解碼後路徑移除', () => {
    const xml = `<urlset><url><loc>https://twdro.net/venues/a/</loc></url><url><loc>https://twdro.net/events/series/${encodeURIComponent('草屯鎮長盃')}/</loc></url><url><loc>https://twdro.net/venues/</loc></url></urlset>`;
    const r = pruneSitemap(xml, new Set(['/venues/a/', '/events/series/草屯鎮長盃/']));
    expect(r.removed).toBe(2);
    expect(r.xml).toContain('https://twdro.net/venues/</loc>');
  });
});

// 以下需先 `npm run build`
const DIST = 'dist';
const hasDist = existsSync(join(DIST, 'sitemap-0.xml'));
const locs = hasDist
  ? [...readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => decodeURIComponent(new URL(m[1]).pathname))
  : [];

describe('建置產物', () => {
  it.skipIf(!hasDist)('sitemap 不含固定前綴底下的明細頁', () => {
    const leaked = locs.filter((p) => NOINDEX_PREFIXES.some((pre) => p.startsWith(pre) && p !== pre));
    expect(leaked).toEqual([]);
  });

  it.skipIf(!hasDist)('hub 頁照常在 sitemap 裡', () => {
    for (const p of ['/', '/venues/', '/teams/', '/events/', '/organizations/', '/learn/skycup-explained/']) {
      expect(locs).toContain(p);
    }
  });

  it.skipIf(!hasDist)('場館明細頁帶 noindex,follow', () => {
    const dir = join(DIST, 'venues');
    const slug = readdirSync(dir).find((n) => existsSync(join(dir, n, 'index.html')) && !/<meta http-equiv="refresh"/.test(readFileSync(join(dir, n, 'index.html'), 'utf8')));
    expect(slug).toBeTruthy();
    expect(readFileSync(join(dir, slug!, 'index.html'), 'utf8')).toContain('<meta name="robots" content="noindex,follow">');
  });

  it.skipIf(!hasDist)('首頁承接核心字，並連到天穹盃（無人機飛球）介紹', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).toContain('<strong>無人機足球</strong>是');
    expect(html).toContain('href="/learn/skycup-explained/"');
  });

  it.skipIf(!hasDist)('天穹盃系列頁連到系列介紹', () => {
    const html = readFileSync(join(DIST, 'events', 'series', '天穹盃', 'index.html'), 'utf8');
    expect(html).toContain('href="/learn/skycup-explained/"');
  });
});
