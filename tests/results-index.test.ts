import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { hasPublishedResults, awaitsResults, teamList } from '../src/lib/results';

// 前置：需先執行 `npm run build`
//
// /events/results/ 是站上唯一把「所有已知名次」攤開的一頁，而名次是本站唯一沒有別人有的
// 資料（2026-07-30 實查：全臺沒有任何可爬取的網頁在公布無人機足球成績）。
// 它壞掉的方式是無聲的：某一場從清單裡消失，頁面照樣渲染、build 照樣過，
// 而消失的那一場不會有人發現——除非那支隊伍自己來找。所以逐場釘死。

interface Ev { slug: string; status: string; title: string; results: any }

const loadEvents = (): Ev[] => {
  const dir = 'src/content/events';
  return readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => {
    const raw = readFileSync(`${dir}/${f}`, 'utf8');
    return {
      slug: f.replace(/\.yml$/, ''),
      status: raw.match(/^status:\s*(\S+)/m)?.[1] ?? '',
      title: (raw.match(/^title:\s*(.*)$/m)?.[1] ?? '').replace(/^['"]|['"]$/g, ''),
      // 只要判斷「有沒有名次」，不需要完整 YAML 解析：results 區塊裡出現任一名次鍵即可。
      results: /^results:/m.test(raw) && /(champion_team|runner_up_team|third_place_team|merit_teams):/.test(raw)
        ? { champion_team: 'x' } : undefined,
    };
  });
};

const html = readFileSync('dist/events/results/index.html', 'utf8');
const events = loadEvents();
const PUBLIC = (s: string) => s !== 'draft';

describe('/events/results/ 成績總表', () => {
  it('每一場有名次的賽事都在頁面上', () => {
    const shouldAppear = events.filter((e) => PUBLIC(e.status) && hasPublishedResults(e.results));
    expect(shouldAppear.length).toBeGreaterThan(0);
    const missing = shouldAppear.filter((e) => !html.includes(`/events/${e.slug}/`));
    expect(missing.map((e) => e.slug)).toEqual([]);
  });

  it('每一場已結束但沒有名次的賽事都列在「尚未公布」，而不是整場消失', () => {
    const shouldAppear = events.filter((e) => PUBLIC(e.status) && awaitsResults(e.status, e.results));
    expect(shouldAppear.length).toBeGreaterThan(0);
    const missing = shouldAppear.filter((e) => !html.includes(`/events/${e.slug}/`));
    expect(missing.map((e) => e.slug)).toEqual([]);
  });

  it('實際名次的隊伍名有印出來——只放連結等於沒有這一頁', () => {
    // 抽站上第一筆成績（嘉義縣選拔賽）的隊名。校名務必取中文原文，
    // 這也是 pipeline PR 內文那條「不要靠英文摘要或羅馬拼音回推」的提醒對應的地方。
    const raw = readFileSync('src/content/events/2026-chiayi-county-selection.yml', 'utf8');
    const teams = [...raw.matchAll(/^\s+(?:champion_team|runner_up_team):\s*(.*)$/gm)]
      .flatMap((m) => teamList(m[1].replace(/^['"]|['"]$/g, '')));
    expect(teams.length).toBeGreaterThan(0);
    for (const t of teams) expect(html).toContain(t);
  });

  it('一頁只出現一次勘誤入口（來源區塊各印一次會像版面壞掉）', () => {
    expect(html.split('這頁的資料有誤').length - 1).toBe(0);
    expect(html.split('來信回報或提供成績').length - 1).toBe(1);
  });
});
