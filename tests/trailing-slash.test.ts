import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// 為什麼有這組測試（2026-07-28）：
//
// 建站時（2026-07-19, e312705）astro.config 寫的是 `trailingSlash: 'never'` 搭配
// `build.format: 'directory'`——這是**互相矛盾**的組合：directory 格式產出的是
// dist/learn/index.html，GitHub Pages 一律把 /learn 301 導到 /learn/，但 astro 卻依
// trailingSlash:'never' 在 sitemap 與 canonical 裡寫無斜線網址。
//
// 後果是 2026-07-20 首次提交給 Google 的 sitemap，83 個網址**每一個都會 301**。Google
// 首次探索這個站看到的整個站都是重導向；7/21 改成 'always' 後，帶斜線版對 Google 而言
// 是全新網址，得重新排隊——GSC 的「頁面會重新導向 19」與大批「已找到／尚未建立索引」
// 都是這個設定錯誤的後果，不是 Google 端的問題。
//
// 這個錯誤能無聲存在，是因為當時沒有任何測試把「設定 → 產物 → 對外網址」串起來檢查，
// 而 astro.config.mjs 在 seo-ops 的 reflect:scope 白名單內、每天可被自動修改。所以守門
// 放在建置產物層而不只是設定層：只要 sitemap／canonical／站內連結有任何一個掉回無斜線，
// CI 就擋下。

const DIST = 'dist';
const hasDist = existsSync(DIST);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

describe('trailing slash 一致性（設定 → 產物 → 對外網址）', () => {
  it('astro.config 的 trailingSlash 與 build.format 必須是相容組合', () => {
    const cfg = readFileSync('astro.config.mjs', 'utf8');
    const trailing = cfg.match(/trailingSlash:\s*'(\w+)'/)?.[1];
    const format = cfg.match(/format:\s*'(\w+)'/)?.[1];
    // directory 格式的靜態主機必然把 /path 301 到 /path/，因此只能配 'always'。
    // 配 'never' 會讓 sitemap／canonical 全部指向會 301 的網址（2026-07-19～07-21 的實際事故）。
    if (format === 'directory') expect(trailing).toBe('always');
    else expect(trailing).not.toBe('always');
  });

  it.skipIf(!hasDist)('sitemap 內所有網址都帶結尾斜線（不得請 Google 收錄會 301 的網址）', () => {
    const xml = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    const bad = locs.filter((u) => !new URL(u).pathname.endsWith('/'));
    expect(bad).toEqual([]);
  });

  it.skipIf(!hasDist)('每頁的 canonical 都帶結尾斜線', () => {
    const bad: string[] = [];
    for (const f of walk(DIST)) {
      const c = readFileSync(f, 'utf8').match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (c && !new URL(c).pathname.endsWith('/')) bad.push(`${f} → ${c}`);
    }
    expect(bad).toEqual([]);
  });

  it.skipIf(!hasDist)('站內連結沒有任何一條缺結尾斜線（每一條都等於一次多餘的 301）', () => {
    const bad: string[] = [];
    for (const f of walk(DIST)) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const p = m[1];
        if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) bad.push(`${f} → ${p}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
