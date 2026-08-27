import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SITE_SECTIONS } from '../src/lib/nav';

// 自己走目錄，不用 fs.globSync——那是 Node 22 才有的 API，而 CI 跑 Node 20。
// （本機 Node 22 測得過、CI 直接 `globSync is not a function` 讓 build 掛掉、
//  deploy 被 skip，網站沒上線。本機版本比 CI 新的坑，這裡不要再踩。）
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name === 'index.html' ? [p] : [];
  });
}

// 前置：需先執行 `npm run build`
//
// 為什麼有這一支（2026-08-03）：外部偵測工具回報「一個 JSON-LD 都沒有」，實測 dist 才發現
// 不是全站沒有，而是 **102 頁裡有 19 頁沒有，且缺的全是索引／樞紐頁**——包含旗艦頁
// /events 與 /learn。同時 organizations／venues／teams 這些實體明細頁只輸出 BreadcrumbList，
// 頁面在描述一個單位／場地／隊伍，卻沒有任何對應的實體節點。
//
// 這種缺漏不會讓 build 失敗、不會讓任何既有測試轉紅，只會安靜地讓 Google 少認得幾百個實體。
// 所以釘死兩件事：每頁至少一個 JSON-LD，且每個區塊都要能 JSON.parse。

const files = walk('dist');

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
      // walk 會一併撈到該區的索引頁本身（它帶的是 CollectionPage，不是實體節點），排除掉。
      // 工具／索引子頁（/teams/records/、/equipment/budget/…）同理：它們描述的是一份清單或
      // 一個計算，不是單一實體。豁免清單讀 lib/nav 的 SITE_SECTIONS subPages——IA 本來就有
      // 單一真實來源，日後再加子頁不必回來改測試（2026-08-27，加 /teams/records/ 時踩到）。
      const toolPaths = new Set(
        SITE_SECTIONS.flatMap((sec) => sec.subPages ?? []).map((item) => join('dist', item.href, 'index.html')),
      );
      const candidates = target.endsWith('.html')
        ? [target]
        : walk(target).filter((f) => f !== join(target, 'index.html') && !toolPaths.has(f));
      expect(candidates.length, `${target} 找不到明細頁`).toBeGreaterThan(0);
      for (const f of candidates) {
        expect(readFileSync(f, 'utf-8'), `${f} 缺 ${needle}`).toContain(needle);
      }
    }
  });
});
