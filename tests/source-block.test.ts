import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 為什麼有這組測試（2026-07-29）：
//
// 「每筆資料標明來源與查核日期」是本站對讀者與主辦單位的核心承諾，但呈現層原本只印
// 分類字（「新聞報導」「廠商資料」），把資料裡本來就有的 title 與 publisher 丟掉了。
// 後果在 /teams/hwahsing-drone-soccer/ 最明顯：該隊有中央社與 Newtalk 兩篇獨立報導
// 互相佐證，畫面上卻是兩個一模一樣的「新聞報導」，看起來像同一個連結貼了兩次——
// 佐證的份量在呈現上整個消失。
//
// 呈現依賴 publisher 一定存在，所以這裡同時守資料面與畫面面。

const SOURCE_DIRS = ['events', 'equipment', 'teams', 'rulebooks'];

/** 從 YAML 粗切出 sources 底下的每一筆來源區塊。 */
function sourceBlocks(text: string): string[] {
  return text.match(/\n {2}- type:[\s\S]*?(?=\n {2}- type:|\n[a-z_]+:|$)/g) ?? [];
}

describe('來源資料完整性', () => {
  const files = SOURCE_DIRS.flatMap((d) =>
    readdirSync(`src/content/${d}`).filter((f) => f.endsWith('.yml')).map((f) => `src/content/${d}/${f}`),
  );

  it('每一筆來源都有 publisher（呈現層拿它當連結主文字）', () => {
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

  it('連結文字是「發布單位〈原標題〉」，不是分類字', () => {
    expect(html).toContain('中央社〈無人機足球接軌國際 台灣首座FIDA標準場地啟用〉');
    expect(html).toContain('Newtalk新聞〈無人機足球接軌國際 台灣首座FIDA標準場地啟用〉');
  });

  it('分類字與信度仍在，只是移出連結文字', () => {
    expect(html).toContain('新聞報導｜信度 B');
  });

  it('同一頁的多個來源，連結文字互不相同（否則獨立佐證看起來像重複連結）', () => {
    const texts = [...html.matchAll(/<a href="https:\/\/(?:www\.cna\.com\.tw|newtalk\.tw)[^"]*"[^>]*>([^<]+)<\/a>/g)]
      .map((m) => m[1]);
    expect(texts.length).toBe(2);
    expect(new Set(texts).size).toBe(2);
  });
});
