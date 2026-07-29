import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { groupSources, bylineOf, hostOf, type SourceItem } from '../src/lib/sources';

// 為什麼有這組測試（2026-07-29）：
//
// 「每筆資料標明來源與查核日期」是本站對讀者與主辦單位的核心承諾，但呈現層原本只印
// 分類字（「新聞報導」「廠商資料」），把資料裡本來就有的 title 與 publisher 丟掉了。
// 後果在 /teams/hwahsing-drone-soccer/ 最明顯：該隊有中央社與 Newtalk 兩篇獨立報導
// 互相佐證，畫面上卻是兩個一模一樣的「新聞報導」，看起來像同一個連結貼了兩次——
// 佐證的份量在呈現上整個消失。
//
// 現在的排法是「標題印一次，各家發布單位各佔一行」，畫面直接讀得出這件事有幾家報過。
// 呈現依賴 publisher 一定存在，所以這裡同時守資料面與畫面面。

const src = (o: Partial<SourceItem>): SourceItem =>
  ({ type: 'news_article', url: 'https://example.com/a', trust_level: 'B', ...o });

describe('groupSources', () => {
  it('標題相同的來源併成一組，轉載幾家就幾行', () => {
    const groups = groupSources([
      src({ title: '同一則報導', publisher: '中央社', url: 'https://cna.com.tw/1' }),
      src({ title: '同一則報導', publisher: 'Newtalk新聞', url: 'https://newtalk.tw/1' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('同一則報導');
    expect(groups[0].items.map(bylineOf)).toEqual(['中央社', 'Newtalk新聞']);
  });

  it('標題不同的來源各自成組（同一家發了兩篇也不併）', () => {
    const groups = groupSources([
      src({ title: 'S4A 一機兩電', publisher: '奧斯丁' }),
      src({ title: 'S4A 一機六電', publisher: '奧斯丁' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['S4A 一機兩電', 'S4A 一機六電']);
  });

  it('沒有標題的來源各自成組，不會被併在一起', () => {
    // 它們只是剛好都缺標題，不代表講的是同一件事
    const groups = groupSources([
      src({ publisher: '教育部', url: 'https://a.tw/1' }),
      src({ publisher: '新北市教育局', url: 'https://b.tw/2' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.title === null)).toBe(true);
  });

  it('保留原始順序', () => {
    const groups = groupSources([
      src({ title: 'B' }), src({ title: 'A' }), src({ title: 'B' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['B', 'A']);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe('bylineOf', () => {
  it('用 publisher', () => {
    expect(bylineOf(src({ publisher: '中央社' }))).toBe('中央社');
  });
  it('publisher 缺漏時退回網域名（仍是從網址推得的事實）', () => {
    expect(bylineOf(src({ url: 'https://www.cna.com.tw/news/1' }))).toBe('cna.com.tw');
  });
  it('網址不合法時原樣回傳，不丟例外', () => {
    expect(hostOf('not-a-url')).toBe('not-a-url');
  });
});

const SOURCE_DIRS = ['events', 'equipment', 'teams', 'rulebooks'];

/** 從 YAML 粗切出 sources 底下的每一筆來源區塊。 */
function sourceBlocks(text: string): string[] {
  return text.match(/\n {2}- type:[\s\S]*?(?=\n {2}- type:|\n[a-z_]+:|$)/g) ?? [];
}

describe('來源資料完整性', () => {
  const files = SOURCE_DIRS.flatMap((d) =>
    readdirSync(`src/content/${d}`).filter((f) => f.endsWith('.yml')).map((f) => `src/content/${d}/${f}`),
  );

  it('每一筆來源都有 publisher（呈現層拿它當署名）', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const blk of sourceBlocks(readFileSync(f, 'utf8'))) {
        if (!/\n\s+publisher:/.test(blk)) missing.push(`${f}：${blk.match(/type:\s*(\S+)/)?.[1]}`);
      }
    }
    expect(missing, `這些來源缺 publisher：\n${missing.join('\n')}`).toEqual([]);
  });
});

// 前置：需先執行 `npm run build`
describe('資料來源呈現', () => {
  const html = readFileSync('dist/teams/hwahsing-drone-soccer/index.html', 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#\d+;/g, '');

  it('標題只印一次，不隨轉載家數重複', () => {
    const hits = text.match(/無人機足球接軌國際 台灣首座FIDA標準場地啟用/g) ?? [];
    expect(hits).toHaveLength(1);
  });

  it('各家發布單位各佔一行，且各自連到自己的網址', () => {
    expect(html).toMatch(/<a href="https:\/\/www\.cna\.com\.tw[^"]*"[^>]*>中央社<\/a>/);
    expect(html).toMatch(/<a href="https:\/\/newtalk\.tw[^"]*"[^>]*>Newtalk新聞<\/a>/);
  });

  it('信度與日期仍在', () => {
    expect(text).toMatch(/信度\s*B/);
    expect(text).toContain('發布 2026-04-11');
    expect(text).toContain('查核 2026-07-20');
  });

  it('有標題時不再印分類字（publisher 已說得更準）', () => {
    expect(text).not.toContain('新聞報導');
  });

  it('沒有標題的來源，改由 publisher 挑大樑並補上分類字', () => {
    const t = readFileSync('dist/events/2026-skycup-newtaipei/index.html', 'utf8').replace(/<[^>]+>/g, ' ');
    expect(t).toMatch(/台灣無人機競技發展協會\s*｜\s*主辦單位公告/);
  });

  // 原始公告下架時，硬刪來源等於抹掉出處。保留網址並標明狀態，讀者才知道我們當初
  // 依據什麼、何時查核——若這個標註消失，畫面就變成指著 404 卻假裝一切正常。
  it('已下架的來源標明狀態與查核日期，網址仍保留', () => {
    const html = readFileSync('dist/events/2026-skycup-newtaipei/index.html', 'utf8');
    const t = html.replace(/<[^>]+>/g, ' ');
    expect(t).toContain('原公告已下架');
    expect(t).toContain('2026-07-29 確認');
    expect(t).toMatch(/依 2026-07-1?9 當時可讀取的版本整理/);
    expect(html).toContain('https://www.cdps.ntpc.edu.tw/p/406-1000-9500,r190.php');
  });

  it('還活著的來源不會被誤標成已下架', () => {
    const t = readFileSync('dist/teams/hwahsing-drone-soccer/index.html', 'utf8').replace(/<[^>]+>/g, ' ');
    expect(t).not.toContain('原公告已下架');
  });
});
