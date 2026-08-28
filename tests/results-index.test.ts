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

// FAQ 的答案會整段進 FAQPage 結構化資料，Google 可能直接把它顯示在搜尋結果上。
// 也就是說這裡打錯字不只是難看——是把錯的東西送去被引用。
// 2026-08-27 補法規題時就把法規名稱誤植成「遙控音人機管理規則」，當場抓到。
describe('FAQ 送進結構化資料的內容', () => {
  const faq = readFileSync('src/pages/faq.astro', 'utf8');
  const built = readFileSync('dist/faq/index.html', 'utf8');

  it('法規名稱與門檻數字寫對', () => {
    expect(faq).toContain('《遙控無人機管理規則》');
    expect(faq).not.toContain('音人機');
    expect(faq).toContain('250 公克');
  });

  it('新增的四題都連到實際存在的目的地', () => {
    for (const href of [
      '/learn/drone-registration-and-licence/',
      '/equipment/budget/',
      '/events/results/',
      '/organizations/#training_provider',
    ]) expect(faq).toContain(href);
  });

  it('答案有進 FAQPage 結構化資料（只放在畫面上等於沒接上）', () => {
    const block = built.match(/<script type="application\/ld\+json">([\s\S]*?FAQPage[\s\S]*?)<\/script>/)?.[1];
    expect(block).toBeTruthy();
    const data = JSON.parse(block!);
    const questions = data.mainEntity.map((x: any) => x.name);
    expect(questions).toEqual(expect.arrayContaining([
      '哪裡查得到無人機足球的比賽成績？',
      '一整隊要花多少錢，不是一台？',
    ]));
  });
});

// 名次欄位曾經被定義兩份（頂層一份、divisions 底下一份），加 fourth_place_team 時只改了
// 頂層——Zod 會**安靜地把不認得的欄位丟掉**，於是「只有殿軍」的組別變成空物件、
// 被 publishedDivisions 過濾掉，整個組別從畫面上消失。build 過、測試綠、什麼都沒說。
// 2026-08-28 抽成共用 schema，這裡把「兩邊支援同一組名次」釘死。
describe('名次欄位在頂層與組別都吃得到', () => {
  const html = readFileSync('dist/events/results/index.html', 'utf8');

  it('殿軍（第四名）在組別裡也印得出來', () => {
    // FIDA 仁川洲際盃臺灣拿的是 Class 40 殿軍，首屆世界盃是 Class20 殿軍。
    const raw = readFileSync('src/content/events/2026-fida-intercontinental-incheon.yml', 'utf8');
    expect(raw).toMatch(/^\s+fourth_place_team:/m);
    expect(html).toContain('殿軍');
    expect(html).toContain('無人機足球 Class 40');
  });

  it('每一個在 YAML 裡有名次的組別，組別名都出現在頁面上', () => {
    // 組別被整個吞掉時，畫面看不出來——只有比對「YAML 有幾組」與「頁面上有幾組」才抓得到。
    const dir = 'src/content/events';
    const missing: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      const block = raw.match(/^results:\n([\s\S]*?)^\w/m)?.[1] ?? '';
      for (const m of block.matchAll(/^\s+- name:\s*(.+)$/gm)) {
        const name = m[1].trim().replace(/^['"]|['"]$/g, '');
        // 該組別底下要真的有名次才會渲染；用「下一個 - name 之前有沒有 _team」判斷。
        const after = block.slice(m.index! + m[0].length);
        const seg = after.split(/^\s+- name:/m)[0];
        if (!/_team:/.test(seg)) continue;
        if (!html.includes(name)) missing.push(`${f}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
