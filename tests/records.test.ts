import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseTeamEntry, collectRecords, groupByTeam, groupBySchool } from '../src/lib/records';

// 前置：需先執行 `npm run build`
//
// 這頁是「用學校／隊伍當入口」的那條路（緣由見 src/lib/records.ts）。它的價值全在名字抄得對——
// 抄錯校名等於把一所學校從名冊上刪掉，而被刪掉的人不會來告訴我們。

describe('parseTeamEntry', () => {
  it('括號裡是縣市＋學校時拆得出來', () => {
    expect(parseTeamEntry('恆興疾風（新竹 十興國小）'))
      .toMatchObject({ team: '恆興疾風', school: '十興國小', area: '新竹' });
    expect(parseTeamEntry('Miracle Wings（彰化 凱勝文理補習班）'))
      .toMatchObject({ team: 'Miracle Wings', school: '凱勝文理補習班', area: '彰化' });
  });

  it('括號裡不是學校時整串留著，不硬拆', () => {
    // 「永慶高中（國中部）」的括號是學程註記。拆成 team=永慶高中 會讓國中部這個關鍵資訊消失。
    expect(parseTeamEntry('永慶高中（國中部）'))
      .toMatchObject({ team: '永慶高中（國中部）', school: null });
  });

  it('沒有括號的「縣市＋校名」也抽得出學校', () => {
    expect(parseTeamEntry('南投縣南崗國中')).toMatchObject({ school: '南崗國中', area: '南投縣' });
    expect(parseTeamEntry('蒜頭國小')).toMatchObject({ school: '蒜頭國小', area: null });
  });

  it('純隊名不亂猜學校', () => {
    for (const raw of ['APEX TEAM', '多元智趣2', '全村的希望', '飛行日常-陝亮登場']) {
      expect(parseTeamEntry(raw).school, raw).toBeNull();
    }
  });

  it('原始寫法逐字保留（校名抄錯就等於把一所學校刪掉）', () => {
    expect(parseTeamEntry('  恆興疾風（新竹 十興國小）  ').raw).toBe('恆興疾風（新竹 十興國小）');
  });
});

describe('反查索引', () => {
  const events = [{
    slug: 'e1', title: 'E1', eventStart: '2026-01-01',
    results: { divisions: [{ name: 'A 組', champion_team: '甲隊（新竹 十興國小）', runner_up_team: ['乙隊', '丙隊'], merit_teams: ['丁隊'] }] },
  }, {
    slug: 'e2', title: 'E2', eventStart: '2026-02-02',
    results: { champion_team: '甲隊（新竹 十興國小）' },
  }];

  it('同一支隊伍在不同賽事的成績會併在一起', () => {
    const teams = groupByTeam(collectRecords(events));
    const jia = teams.find((t) => t.key === '甲隊');
    expect(jia?.rows.map((r) => r.eventSlug)).toEqual(['e1', 'e2']);
  });

  it('並列名次拆成多筆，優勝也收', () => {
    const rows = collectRecords(events);
    expect(rows.filter((r) => r.place === '亞軍').map((r) => r.team)).toEqual(['乙隊', '丙隊']);
    expect(rows.some((r) => r.place === '優勝' && r.team === '丁隊')).toBe(true);
  });

  it('學校分組只收來源明確寫出學校的——不從隊名猜', () => {
    const schools = groupBySchool(collectRecords(events));
    expect(schools.map((s) => s.key)).toEqual(['十興國小']);
  });
});

describe('/teams/records/ 產出', () => {
  const html = readFileSync('dist/teams/records/index.html', 'utf8');

  it('站上每一個出現在成績裡的隊名與校名都印得出來', () => {
    const dir = 'src/content/events';
    const names = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      for (const m of raw.matchAll(/^\s+(?:champion_team|runner_up_team|third_place_team):\s*(.+)$/gm)) {
        const v = m[1].trim();
        if (v.startsWith('[') || v === '') continue;
        names.add(v.replace(/^['"]|['"]$/g, ''));
      }
    }
    expect(names.size).toBeGreaterThan(10);
    const missing = [...names].filter((n) => !html.includes(parseTeamEntry(n).team));
    expect(missing).toEqual([]);
  });

  it('頁面上的每一個隊伍標題都能在 events 資料裡找到出處', () => {
    // UASACT 的官方成績 PDF 同時列出教練與選手姓名，那份資料我們刻意只抄隊名。
    // 直接比對「頁面上出現的名字」與「YAML 裡的名次欄位」，任何多出來的名字都會被抓到——
    // 這比列黑名單可靠：黑名單要先知道會冒出哪些字，而個資外洩正好是「冒出你沒想到的字」。
    const dir = 'src/content/events';
    const allowed = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      // 名次欄位有三種寫法：單一字串、行內陣列 `[A, B]`、以及 merit_teams 的行內陣列。
      for (const m of raw.matchAll(/^\s+(?:champion_team|runner_up_team|third_place_team|merit_teams):\s*(.+)$/gm)) {
        const v = m[1].trim().replace(/^['"]|['"]$/g, '');
        if (!v) continue;
        const items = v.startsWith('[') ? v.slice(1, -1).split(',') : [v];
        for (const item of items) {
          const name = item.trim().replace(/^['"]|['"]$/g, '');
          if (name) allowed.add(parseTeamEntry(name).team);
        }
      }
    }
    // 隊伍區塊的每個 <h3> 內容都必須來自上面那份清單（學校區塊的標題另有其來源，分開驗）。
    const headings = [...html.matchAll(/<h3 id="t-[^"]*"[^>]*>([^<]*)/g)].map((m) => m[1].trim()).filter(Boolean);
    expect(headings.length).toBeGreaterThan(10);
    const schools = new Set(groupBySchool(collectRecords([])).map((s) => s.key));
    const stray = headings.filter((h) => !allowed.has(h) && !schools.has(h) && !/國小|國中|中學|高中|高工|補習班|大學/.test(h));
    expect(stray).toEqual([]);
  });
});
