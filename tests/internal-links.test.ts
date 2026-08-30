import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
//
// 孤兒頁＝進了 sitemap、但站內沒有任何一個連結指到它的頁。它有兩種代價，而且都很安靜：
// 讀者用瀏覽的方式永遠走不到（只有直接搜到才進得來），而 Google 只能靠 sitemap 發現它
// ——本站的收錄歷史已經證明「被發現」不等於「會被爬」，內鏈是少數我們真的控制得了的訊號。
// 頁面照樣渲染、build 照樣過、別的測試也不會轉紅，所以釘在這裡。
//
// ⚠️ 判斷孤兒時**必須把 href 解碼再比對**。站上有中文網址（/teams/school/埔里國中/、
// /events/series/天穹盃/），HTML 裡是百分比編碼的 `%E5%9F%94...`，拿解碼後的路徑直接比
// 會得到「33 個孤兒頁」這種假警報——2026-08-30 第一次寫這個檢查時就是這樣誤判的。
//
// 轉址頁（astro.config.mjs 的 redirects）不進 sitemap，本來就不該有人連它，故不在檢查範圍。

const dist = 'dist';
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

const sitemapPaths = [...readFileSync(`${dist}/sitemap-0.xml`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => decode(new URL(m[1]).pathname));

const pageFile = (p: string) => `${dist}${p}index.html`;

describe('站內連結', () => {
  it('sitemap 上的每一頁都至少有一個站內連結指到它（沒有孤兒頁）', () => {
    expect(sitemapPaths.length).toBeGreaterThan(50);
    const inbound = new Map<string, number>(sitemapPaths.map((p) => [p, 0]));
    for (const p of sitemapPaths) {
      const html = readFileSync(pageFile(p), 'utf8');
      // 同一頁指向同一個目標多次只算一次，自己連自己不算。
      for (const href of new Set([...html.matchAll(/href="(\/[^"#?]*?)"/g)].map((m) => decode(m[1])))) {
        if (href === p) continue;
        const n = inbound.get(href);
        if (n !== undefined) inbound.set(href, n + 1);
      }
    }
    const orphans = [...inbound].filter(([, n]) => n === 0).map(([p]) => p).sort();
    expect(orphans, '這些頁進了 sitemap 但站內沒有任何連結指到——讀者走不到，Google 也只能靠 sitemap')
      .toEqual([]);
  });
});
