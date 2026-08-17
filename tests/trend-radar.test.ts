import { describe, expect, it } from 'vitest';

// trend-radar.mjs 不在 import 時抓網路；測試只驗證訊號解析與門檻計算，
// 避免把外部服務的即時狀態混進 CI。
import { parseSuggestions, parseTrendingRss, scoreCandidate } from '../scripts/trend-radar.mjs';

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
