import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
//
// 為什麼有這一支（2026-08-03）：外部偵測工具回報「一個 JSON-LD 都沒有」，實測 dist 才發現
// 不是全站沒有，而是 **102 頁裡有 19 頁沒有，且缺的全是索引／樞紐頁**——包含旗艦頁
// /events 與 /learn。同時 organizations／venues／teams 這些實體明細頁只輸出 BreadcrumbList，
// 頁面在描述一個單位／場地／隊伍，卻沒有任何對應的實體節點。
//
// 這種缺漏不會讓 build 失敗、不會讓任何既有測試轉紅，只會安靜地讓 Google 少認得幾百個實體。
// 所以釘死兩件事：每頁至少一個 JSON-LD，且每個區塊都要能 JSON.parse。

const files = globSync('dist/**/index.html');

describe('JSON-LD 覆蓋率', () => {
  it('build 產物存在', () => {
    expect(existsSync('dist/index.html')).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it('每一頁都至少有一個 JSON-LD 區塊', () => {
    const missing = files.filter((f) => !readFileSync(f, 'utf-8').includes('application/ld+json'));
    expect(missing, `這些頁沒有 JSON-LD：\n${missing.join('\n')}`).toEqual([]);
  });

  it('每個 JSON-LD 區塊都是合法 JSON 且有 @type', () => {
    const bad: string[] = [];
    for (const f of files) {
      const html = readFileSync(f, 'utf-8');
      const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
      for (const b of blocks) {
        const body = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
        try {
          const parsed = JSON.parse(body);
          const nodes = parsed['@graph'] ?? [parsed];
          for (const n of nodes) if (!n['@type']) bad.push(`${f}：區塊缺 @type`);
        } catch (e) {
          bad.push(`${f}：JSON 解析失敗 ${(e as Error).message}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('ItemList 每一項都要有名字與網址', () => {
    // 2026-08-03 首次加索引頁 JSON-LD 時就踩到：events 的欄位叫 title 不叫 name、
    // rulebooks 反過來叫 name 不叫 title，寫錯的那四頁 ItemList 全部送出 name: undefined。
    // build 不會失敗、頁面看不出來，只有 astro check 抓到。這條把它釘死。
    const bad: string[] = [];
    for (const f of files) {
      const html = readFileSync(f, 'utf-8');
      const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
      for (const b of blocks) {
        const body = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
        const parsed = JSON.parse(body);
        const list = parsed.mainEntity?.itemListElement;
        if (!Array.isArray(list)) continue;
        for (const it of list) {
          if (!it.name || typeof it.name !== 'string') bad.push(`${f}：ItemList 項目缺 name`);
          if (!it.url) bad.push(`${f}：ItemList 項目缺 url`);
        }
      }
    }
    expect(bad, [...new Set(bad)].join('\n')).toEqual([]);
  });

  it('實體明細頁要有對應的實體節點，不能只有麵包屑', () => {
    // 只有 BreadcrumbList 等於「這頁在講什麼」完全沒說。逐類抽一頁當哨兵。
    const expectations: [string, string][] = [
      ['dist/organizations/oursteam/index.html', '"Organization"'],
      ['dist/venues', '"Place"'],
      ['dist/teams', '"SportsTeam"'],
    ];
    for (const [target, needle] of expectations) {
      const candidates = target.endsWith('.html')
        ? [target]
        : globSync(`${target}/*/index.html`);
      expect(candidates.length, `${target} 找不到明細頁`).toBeGreaterThan(0);
      for (const f of candidates) {
        expect(readFileSync(f, 'utf-8'), `${f} 缺 ${needle}`).toContain(needle);
      }
    }
  });
});
