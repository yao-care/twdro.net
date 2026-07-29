import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { correctionUrl, correctionMailto, CORRECTION_EMAIL } from '../src/lib/correction';

// 為什麼有這組測試（2026-07-28）：
// 「資料有誤請告訴我們」是本站對主辦單位、協會與學校的主要承諾，也是接觸他們時最實在的
// 籌碼。但在此之前唯一的入口是 /about/correction/，只從 footer 與 /about/ 進得去——看到
// 某場賽事日期有誤的人正在看賽事頁，不會先繞到「關於本站」。入口一旦又從資料明細頁消失，
// 那個承諾就退回紙上，而且沒有任何機制會發現。

describe('correctionUrl', () => {
  const link = correctionUrl({ path: '/events/2026-skycup-tainan/', title: '2026 天穹盃臺南站' });
  const parsed = new URL(link);

  it('指向本 repo 的 issue 表單並帶 data-correction 標籤', () => {
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/yao-care/twdro.net/issues/new');
    expect(parsed.searchParams.get('labels')).toBe('data-correction');
  });

  it('標題帶入該筆資料名稱，收件時一眼看得出改的是哪一筆', () => {
    expect(parsed.searchParams.get('title')).toBe('資料更正：2026 天穹盃臺南站');
  });

  it('內文預填該頁完整網址與必要欄位，讓回報一開始就可處理', () => {
    const body = parsed.searchParams.get('body') ?? '';
    expect(body).toContain('https://twdro.net/events/2026-skycup-tainan/');
    for (const field of ['錯誤欄位', '正確內容', '來源證明']) expect(body).toContain(field);
  });

  it('中文與特殊字元正確編碼（未編碼會讓連結在部分瀏覽器斷掉）', () => {
    const raw = correctionUrl({ path: '/rules/fai-f9a-b-2026/', title: 'FAI F9A-B 2026 & 附則' });
    expect(() => new URL(raw)).not.toThrow();
    expect(new URL(raw).searchParams.get('title')).toBe('資料更正：FAI F9A-B 2026 & 附則');
  });
});

// 2026-07-29：補 email 管道。只有 GitHub 時，對最該回報的協會、學校與主辦單位是真門檻。
describe('correctionMailto', () => {
  const link = correctionMailto({ path: '/events/2026-skycup-tainan/', title: '2026 天穹盃臺南站' });

  it('寄到服務信箱並預填主旨與內文', () => {
    expect(link.startsWith(`mailto:${CORRECTION_EMAIL}?`)).toBe(true);
    expect(decodeURIComponent(link)).toContain('資料更正：2026 天穹盃臺南站');
    expect(decodeURIComponent(link)).toContain('https://twdro.net/events/2026-skycup-tainan/');
  });

  it('空白用百分比編碼，不是 +（mailto 會把 + 原樣顯示成加號）', () => {
    const spaced = correctionMailto({ path: '/rules/fai-f9a-b-2026/', title: 'FAI F9A-B 2026' });
    const subject = spaced.match(/subject=([^&]*)/)![1];
    expect(subject).not.toContain('+');
    expect(decodeURIComponent(subject)).toBe('資料更正：FAI F9A-B 2026');
  });

  it('換行編成 %0A，收信端才會分行', () => {
    expect(link).toContain('%0A');
  });

  it('兩個管道的欄位範本一致', () => {
    const viaMail = decodeURIComponent(link.split('body=')[1]);
    const viaIssue = new URL(correctionUrl({ path: '/events/2026-skycup-tainan/', title: '2026 天穹盃臺南站' }))
      .searchParams.get('body')!;
    expect(viaMail).toBe(viaIssue);
  });
});

// 前置：需先執行 `npm run build`
describe('勘誤入口出現在資料明細頁', () => {
  const pages = [
    'dist/events/2026-skycup-tainan/index.html',
    'dist/rules/fai-f9a-b-2026/index.html',
    'dist/equipment/oursteam-s4a/index.html',
  ];
  for (const p of pages) {
    it(`${p} 兩個管道都在，且都帶本頁網址`, () => {
      const html = readFileSync(p, 'utf8');
      expect(html).toContain(CORRECTION_EMAIL);
      expect(html).toContain('在 GitHub 提交');
      // 兩個管道的預填內文都必須是「這一頁」的網址，不是寫死的首頁或範本頁。
      // 屬性值裡的 & 被 Astro escape 成 &#38;，先還原成瀏覽器實際解析到的樣子，
      // 再真的 parse 一次——只用字串比對的話，連結壞掉（參數黏在一起）也驗不出來。
      const pageUrl = 'https://twdro.net/' + p.replace(/^dist\//, '').replace(/index\.html$/, '');
      const unescape = (s: string) => s.replace(/&#38;|&amp;/g, '&');
      const mailto = html.match(/href="(mailto:[^"]*)"/)?.[1];
      const issue = html.match(/href="(https:\/\/github\.com\/yao-care\/twdro\.net\/issues\/new[^"]*)"/)?.[1];
      expect(mailto, '找不到 mailto 入口').toBeTruthy();
      expect(issue, '找不到 GitHub 入口').toBeTruthy();

      const mailParams = new URLSearchParams(unescape(mailto!).split('?')[1]);
      expect(mailParams.get('body')).toContain(pageUrl);
      expect(mailParams.get('subject')).toMatch(/^資料更正：./);

      const issueParams = new URL(unescape(issue!)).searchParams;
      expect(issueParams.get('body')).toContain(pageUrl);
      expect(issueParams.get('labels')).toBe('data-correction');
    });
  }
});
