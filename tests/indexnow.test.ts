import { describe, it, expect } from 'vitest';
import { changedUrls, recentUrls, lastmodMap } from '../scripts/indexnow-submit.mjs';

// 2026-08-30：原本的規則是「推 lastmod 在 3 天內的網址」，實際效果是每次部署都把同一批
// 網址重推一次——當天 15:15 推 106 筆、22:30 推 105 筆，相隔 7 小時、幾乎同一批。
// 改成跟上線前的 sitemap 快照比對，只推真的變了的。這些斷言釘的就是「只推變的」這件事，
// 因為推多了不會有任何錯誤訊息，只會安靜地稀釋訊號。

const sitemap = (rows: [string, string?][]) =>
  `<urlset>${rows.map(([loc, lastmod]) =>
    `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}T00:00:00.000Z</lastmod>` : ''}</url>`,
  ).join('')}</urlset>`;

const A = 'https://twdro.net/events/a/';
const B = 'https://twdro.net/events/b/';
const C = 'https://twdro.net/events/c/';

describe('changedUrls', () => {
  it('完全沒變時不推任何網址（這才是修掉重複推送的關鍵）', () => {
    const xml = sitemap([[A, '2026-08-27'], [B, '2026-08-28']]);
    expect(changedUrls(xml, xml)).toEqual([]);
  });

  it('只推 lastmod 變了的那一筆，沒變的不跟著送', () => {
    const prev = sitemap([[A, '2026-08-27'], [B, '2026-08-28']]);
    const cur = sitemap([[A, '2026-08-30'], [B, '2026-08-28']]);
    expect(changedUrls(prev, cur)).toEqual([A]);
  });

  it('新出現的網址要推', () => {
    const prev = sitemap([[A, '2026-08-27']]);
    const cur = sitemap([[A, '2026-08-27'], [C, '2026-08-30']]);
    expect(changedUrls(prev, cur)).toEqual([C]);
  });

  it('消失的網址不推——那要靠轉址與 404，推一個已經不存在的網址只會被記成抓取失敗', () => {
    const prev = sitemap([[A, '2026-08-27'], [B, '2026-08-28']]);
    const cur = sitemap([[A, '2026-08-27']]);
    expect(changedUrls(prev, cur)).toEqual([]);
  });

  it('沒有 lastmod 的網址照樣參與比較，不會被當成「沒變」而漏掉', () => {
    // venues／organizations 這類沒有日期欄位的集合，lastmod 由 git commit 日期補；
    // 真的補不出來時 sitemap 允許缺省（見 astro.config.mjs 的 serialize）。
    const prev = sitemap([[A]]);
    const cur = sitemap([[A, '2026-08-30']]);
    expect(changedUrls(prev, cur)).toEqual([A]);
    expect(lastmodMap(sitemap([[A]])).get(A)).toBe('');
  });
});

describe('recentUrls（快照缺席時的退路）', () => {
  it('第一次跑或快照抓取失敗時仍推得出東西——寧可多推也不要漏推', () => {
    const xml = sitemap([[A, '2026-08-27'], [B, '2026-08-20']]);
    expect(recentUrls(xml, '2026-08-25')).toEqual([A]);
  });
});
