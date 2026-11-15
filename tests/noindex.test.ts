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

// 2026-11-15 用戶拍板：單場賽事頁不收錄，搜尋集中到年度賽事總表（理由見 src/lib/noindex.mjs）。
// 要防的退化：①單場頁又回到 sitemap 或掉了 noindex；②年度總表被當成稀薄頁 noindex 掉、
// 或被拿出 sitemap；③有人在 robots.txt 擋 /events/（擋爬會讓 noindex 本身讀不到）；
// ④總表退化回一疊卡片，搜尋者落地看不到日期／地點／主辦／組別。
import { eventDetailPaths, readEventIds } from '../src/lib/noindex.mjs';

describe('單場賽事頁 noindex、年度總表收錄（純函式）', () => {
  it('賽事 id 清單裡的路徑 noindex；/events/ 其他頁不受影響', async () => {
    const ids = await readEventIds();
    expect(ids.length).toBeGreaterThan(0);
    const eventPaths = eventDetailPaths(ids);
    expect(decideNoindex(`/events/${ids[0]}/`, '', { eventPaths }).noindex).toBe(true);
    for (const p of ['/events/', '/events/calendar/', '/events/results/', '/events/year/2026/']) {
      expect(decideNoindex(p, '<main>短</main>', { eventPaths }).noindex, p).toBe(false);
    }
  });
  it('年度頁不在固定 noindex 前綴裡', () => {
    expect(NOINDEX_PREFIXES).not.toContain('/events/year/');
  });
  it('robots.txt 不擋 /events/', () => {
    const robots = readFileSync('public/robots.txt', 'utf8');
    const disallows = [...robots.matchAll(/^\s*Disallow:\s*(\S*)/gim)].map((m) => m[1]);
    for (const d of disallows) expect('/events/x/'.startsWith(d) && d !== '', `Disallow: ${d}`).toBe(false);
  });
});

describe('建置產物：單場賽事頁與年度總表', () => {
  const eventIds = existsSync('src/content/events')
    ? readdirSync('src/content/events').filter((n) => n.endsWith('.yml')).map((n) => n.replace(/\.yml$/, ''))
    : [];
  const builtEvents = eventIds.filter((id) => existsSync(join(DIST, 'events', id, 'index.html')));
  const years = hasDist ? readdirSync(join(DIST, 'events', 'year')).filter((y) => /^\d{4}$/.test(y)) : [];

  it.skipIf(!hasDist)('每一個單場賽事頁都帶 noindex,follow，且不在 sitemap', () => {
    expect(builtEvents.length).toBeGreaterThan(0);
    for (const id of builtEvents) {
      const html = readFileSync(join(DIST, 'events', id, 'index.html'), 'utf8');
      expect(html, id).toContain('<meta name="robots" content="noindex,follow">');
      expect(locs, id).not.toContain(`/events/${id}/`);
    }
  });

  it.skipIf(!hasDist)('賽事 hub 與每個年度總表都在 sitemap、沒有 noindex', () => {
    expect(years.length).toBeGreaterThan(0);
    for (const p of ['/events/', ...years.map((y) => `/events/year/${y}/`)]) {
      expect(locs, p).toContain(p);
      const html = readFileSync(join(DIST, p.slice(1), 'index.html'), 'utf8');
      expect(html, p).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
    }
  });

  it.skipIf(!hasDist)('年度總表的標題與 h1 帶搜尋說法，且每場都列出日期／地點／主辦／組別並連到賽事頁', () => {
    for (const y of years) {
      const html = readFileSync(join(DIST, 'events', 'year', y, 'index.html'), 'utf8');
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
      for (const t of [title, h1]) {
        expect(t, y).toContain('無人機足球');
        expect(t, y).toMatch(/比賽|賽事/);
        expect(t, y).toContain(y);
      }
      const cards = html.match(/<article class="panel year-event[\s\S]*?<\/article>/g) ?? [];
      expect(cards.length, y).toBeGreaterThan(0);
      for (const c of cards) {
        for (const k of ['日期', '地點', '主辦', '組別']) expect(c).toContain(`<span class="k">${k}</span>`);
        expect(c).toMatch(/<span class="k">(成績|報名|報名／成績)<\/span>/);
        expect(c).toMatch(/href="\/events\/[^"/]+\/"/);
      }
    }
  });
});
