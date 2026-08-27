import { describe, expect, it } from 'vitest';

// trend-radar.mjs 不在 import 時抓網路；測試只驗證訊號解析與門檻計算，
// 避免把外部服務的即時狀態混進 CI。
import { parseSuggestions, parseTrendingRss, scoreCandidate, signalGate } from '../scripts/trend-radar.mjs';

describe('trend radar', () => {
  it('讀取 Google／Bing 相容的建議字 JSON', () => {
    expect(parseSuggestions('["天穹盃",["天穹盃","天穹盃無人機飛球錦標賽"],[],{}]'))
      .toEqual(['天穹盃', '天穹盃無人機飛球錦標賽']);
    expect(parseSuggestions('not-json')).toEqual([]);
  });

  it('保留 RSS 的熱門項目與新聞來源', () => {
    const rss = '<item><title>無人機足球</title><ht:approx_traffic>10K+</ht:approx_traffic>' +
      '<pubDate>Mon, 17 Aug 2026 00:00:00 GMT</pubDate><ht:news_item_source>Example</ht:news_item_source>' +
      '<ht:news_item_url>https://example.com/news</ht:news_item_url></item>';
    expect(parseTrendingRss(rss)[0]).toMatchObject({ title: '無人機足球', traffic: '10K+', source: 'Example' });
  });

  it('只有雙引擎訊號加近期已驗證來源才達到發布分數', () => {
    expect(scoreCandidate({ googleHits: 2, bingHits: 2, upcomingDays: 12, verified: true, sourceCount: 2 }))
      .toBeGreaterThanOrEqual(7);
    expect(scoreCandidate({ googleHits: 2, bingHits: 0, upcomingDays: 12, verified: true, sourceCount: 2 }))
      .toBeLessThan(7);
  });
});

describe('建議字引擎不可用時的降級判準', () => {
  // 2026-08-17 建立這條產線起，Google Suggest 對本主機的資料中心 IP 一律回 403
  // （complete/search 的 firefox／chrome／gws-wiz／toolbar 四個端點實測皆同）。
  // 原本的程式把「抓不到」與「沒有建議字」都算成 0，於是雙引擎各 ≥2 的要求、以及
  // 7 分門檻裡只有 Google 拿得到的 4 分，兩道都變成永遠不可能通過——
  // 產線一次都沒發過文，而輸出看起來只是「訊號未達門檻」。這裡把修好的判準釘死。

  it('兩個引擎都在線時維持原判準', () => {
    const g = signalGate({ googleHits: 2, bingHits: 2, googleAvailable: true, bingAvailable: true, score: 7 });
    expect(g).toMatchObject({ enough: true, threshold: 7, degraded: false });
    expect(signalGate({ googleHits: 2, bingHits: 1, googleAvailable: true, bingAvailable: true, score: 7 }).enough).toBe(false);
  });

  it('只剩一個引擎時降門檻但提高該引擎的要求，且標明降級', () => {
    const g = signalGate({ googleHits: 0, bingHits: 3, googleAvailable: false, bingAvailable: true, score: 6 });
    expect(g.enough).toBe(true);
    expect(g.threshold).toBe(5);
    expect(g.degraded).toBe(true);
    expect(g.note).toContain('Google');           // 掉線的那個要指名正確
    expect(g.note).not.toContain('Bing 建議字不可用');
    // 在線引擎只有 2 個建議字時不夠——少了交叉佐證就該更嚴，不是照原樣放行
    expect(signalGate({ googleHits: 0, bingHits: 2, googleAvailable: false, bingAvailable: true, score: 6 }).enough).toBe(false);
  });

  it('兩個引擎都抓不到時一律不發布', () => {
    const g = signalGate({ googleHits: 0, bingHits: 0, googleAvailable: false, bingAvailable: false, score: 10 });
    expect(g.enough).toBe(false);
    expect(g.threshold).toBe(Infinity);
  });

  it('降級後的門檻真的拿得到——否則等於沒修', () => {
    // 只剩 Bing 時，可得分數的上限是 bing 2 ＋ 近期賽事 2 ＋ 已驗證 1 ＋ 來源 1 ＝ 6。
    // 門檻若仍是 7，這條產線就還是永遠發不出東西。
    const best = scoreCandidate({ googleHits: 0, bingHits: 3, upcomingDays: 5, verified: true, sourceCount: 2 });
    const gate = signalGate({ googleHits: 0, bingHits: 3, googleAvailable: false, bingAvailable: true, score: best });
    expect(best).toBeGreaterThanOrEqual(gate.threshold);
  });
});
