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

  it('「市立／縣立」不能被當成縣市前綴剝掉', () => {
    // 剝掉會剩下「立林園高級中學」——不是任何一所學校的名字，而且會變成一個沒有人
    // 搜得到的網址。2026-08-27 學校頁第一次產出時就出現過這個目錄。
    expect(parseTeamEntry('高雄市立林園高級中學'))
      .toMatchObject({ school: '高雄市立林園高級中學', area: '高雄市' });
    expect(parseTeamEntry('新北市立三民高級中學').school).toBe('新北市立三民高級中學');
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

// 從一份賽事 YAML 抽出所有名次欄位裡的隊名。
//
// 為什麼要獨立成一個函式而不是各測試各寫一條正規式（2026-08-28）：原本兩個測試各抄了一份，
// 而且都只認得 champion／runner_up／third_place。加 fourth_place_team 之後，
// 「只有殿軍的隊伍」在頁面上印得出來、卻不在測試的允許清單裡，於是被判成來路不明的名字
// ——**測試反過來誣告正確的資料**。這與當初 divisions 漏加欄位是同一種錯：
// 同一件事寫兩份就會走鐘，所以只留一份。
//
// 三種寫法都要吃得下：單一字串、行內陣列 `[A, B]`、以及區塊列表（`- A` 逐行）。
// 冒號後只吃同一行的空白：`\s*` 會連換行一起吃掉，於是空值欄位會把下一行的 `- 隊名`
// 整串當成值，隊名前面多一個「- 」——測試就開始抱怨一個根本不存在的隊伍。
// `team` 是 other_places 底下那一層的鍵（`- place: 並列第 5` / `  team: TPE-Team 1`）。
// 2026-08-28 補：加 other_places 當天這裡又漏了一次，症狀一模一樣——頁面印得出隊名、
// 測試的允許清單裡沒有，於是測試誣告正確的資料。這已經是同一個坑的第二次，
// 所以欄位名寫成一條 alternation 擺在最前面，加欄位時第一眼就看得到要動這裡。
const PLACE_FIELDS = /^(\s+)(?:champion_team|runner_up_team|third_place_team|fourth_place_team|merit_teams|team):[ \t]*([^\n]*)$/gm;
const unquote = (s: string) => s.trim().replace(/^['"]|['"]$/g, '');
export function placeNames(raw: string): string[] {
  const out: string[] = [];
  const lines = raw.split('\n');
  for (const m of raw.matchAll(PLACE_FIELDS)) {
    const value = m[2].trim();
    if (value.startsWith('[')) {
      out.push(...value.slice(1, -1).split(',').map(unquote).filter(Boolean));
      continue;
    }
    if (value) { out.push(unquote(value)); continue; }
    // 值是空的 → 區塊列表，往下收到縮排結束為止。
    // 縮排一定要比欄位本身深：下一個組別的 `- name:` 也長得像列表項，
    // 只看「是不是 - 開頭」會一路吃進去，把組別名當成隊名。
    const indent = m[1].length;
    const start = raw.slice(0, m.index!).split('\n').length;
    for (let i = start; i < lines.length; i++) {
      const item = lines[i].match(/^(\s+)-\s+(.+)$/);
      if (!item || item[1].length <= indent) break;
      out.push(unquote(item[2]));
    }
  }
  return out.filter(Boolean);
}

// 頁面是 HTML，隊名裡的撇號會被轉成實體（`pig's` → `pig&#39;s`）。
// 直接拿原字串去 includes 會找不到，然後被誤判成「這個隊名沒印出來」。
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const shown = (html: string, name: string) => html.includes(name) || html.includes(esc(name));

// 2026-08-30：埔里國中——站上拿最多冠軍的學校——的戰績曾被拆成兩頁。
// 起因是同一所學校在不同賽事的名次字串寫法不同：一場寫「南投縣立埔里國中」（官方全名，
// 走 parseTeamEntry 的「縣市＋立」分支，整串當校名），其他場寫「（南投 埔里國中）」。
// 於是 /teams/school/ 長出兩個 key，各收一半戰績，而搜「埔里國中」的人只看得到其中一半。
// **這種壞法不會讓 build 失敗、不會讓別的測試轉紅**：兩頁都渲染正常、名字也都抄對了，
// 錯的是它們本來該是同一頁。修法是統一資料寫法（校名以來源的常用名為準），不是改 parser
// ——「市立／縣立不能被當前綴剝掉」那一條是刻意的決定，見上面那個測試。
describe('同一所學校不會因為寫法不同而分裂成兩頁', () => {
  it('沒有任何校名是另一個校名的字尾', () => {
    const dir = 'src/content/events';
    const schools = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      for (const n of placeNames(readFileSync(`${dir}/${f}`, 'utf8'))) {
        const s = parseTeamEntry(n).school;
        if (s) schools.add(s);
      }
    }
    expect(schools.size).toBeGreaterThan(5);
    const list = [...schools];
    const split = list.flatMap((a) =>
      list
        .filter((b) => b !== a && a.length >= 3 && b.endsWith(a))
        .map((b) => `${b} ／ ${a}`));
    expect(split, '疑似同一所學校被拆成兩頁——把資料統一成同一種寫法').toEqual([]);
  });
});

describe('/teams/records/ 產出', () => {
  const html = readFileSync('dist/teams/records/index.html', 'utf8');

  it('站上每一個出現在成績裡的隊名與校名都印得出來', () => {
    const dir = 'src/content/events';
    const names = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      for (const n of placeNames(readFileSync(`${dir}/${f}`, 'utf8'))) names.add(n);
    }
    expect(names.size).toBeGreaterThan(10);
    const missing = [...names].filter((n) => !shown(html, parseTeamEntry(n).team));
    expect(missing).toEqual([]);
  });

  it('頁面上的每一個隊伍標題都能在 events 資料裡找到出處', () => {
    // UASACT 的官方成績 PDF 同時列出教練與選手姓名，那份資料我們刻意只抄隊名。
    // 直接比對「頁面上出現的名字」與「YAML 裡的名次欄位」，任何多出來的名字都會被抓到——
    // 這比列黑名單可靠：黑名單要先知道會冒出哪些字，而個資外洩正好是「冒出你沒想到的字」。
    const dir = 'src/content/events';
    const allowed = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      for (const n of placeNames(readFileSync(`${dir}/${f}`, 'utf8'))) {
        allowed.add(parseTeamEntry(n).team);
        allowed.add(esc(parseTeamEntry(n).team));
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
