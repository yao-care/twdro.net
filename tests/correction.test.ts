import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { correctionUrl } from '../src/lib/correction';

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

// 前置：需先執行 `npm run build`
describe('勘誤入口出現在資料明細頁', () => {
  const pages = [
    'dist/events/2026-skycup-tainan/index.html',
    'dist/rules/fai-f9a-b-2026/index.html',
    'dist/equipment/oursteam-s4a/index.html',
  ];
  for (const p of pages) {
    it(`${p} 有回報入口且帶本頁網址`, () => {
      const html = readFileSync(p, 'utf8');
      expect(html).toContain('回報這一頁的錯誤');
      // 預填內文裡必須是「這一頁」的網址，不是寫死的首頁或範本頁
      const own = 'https%3A%2F%2Ftwdro.net%2F' + p.replace(/^dist\//, '').replace(/index\.html$/, '').replace(/\//g, '%2F');
      expect(html).toContain(own);
    });
  }
});
