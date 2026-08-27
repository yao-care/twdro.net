/**
 * 成績反查：把「賽事 → 名次 → 隊伍」翻成「隊伍／學校 → 拿過什麼」。
 *
 * 為什麼要有這個（2026-08-27）：
 * 站上頭部字的天花板已經量到了——GSC 近 90 天有 26 個網址排在第一頁，合計只換到 129 次曝光。
 * 「無人機足球」這個詞在臺灣的需求就是那個量級，再優化也翻不出去。
 * **但每一所學校、每一支隊伍都是一個獨立查詢，而且沒有任何人在維護那份名冊。**
 * 對照證據：2026-08-03 逼出整條縣市公告 pipeline 的那個 GSC 查詢，是
 * 「無人機足球比賽嘉義縣蒜頭國小」——一個具名學校的查詢。
 *
 * 資料早就在 events 的 results 裡，只是只能由賽事往下看，不能由隊伍往回查。
 * 這支不新增任何資料，只把既有名次重新索引。
 */

import { teamList, publishedDivisions, type ResultBlock } from './results';

/** 名次在頁面上的顯示順序與標籤（與賽事頁一致）。 */
export const PLACE_LABELS = [
  ['champion_team', '冠軍'],
  ['runner_up_team', '亞軍'],
  ['third_place_team', '季軍'],
] as const;

export interface RecordRow {
  /** 隊伍在來源上的原始寫法，逐字保留 */
  raw: string;
  /** 去掉括號註記後的隊名（用來當顯示標題與比對鍵） */
  team: string;
  /** 括號裡標明的學校，來源沒寫就是 null——不從隊名猜 */
  school: string | null;
  /** 學校前面標的縣市，來源沒寫就是 null */
  area: string | null;
  eventSlug: string;
  eventTitle: string;
  eventStart: string | null;
  division: string | null;
  place: string;
}

// 括號裡是不是「縣市＋學校」。臺灣的成績公告習慣寫成「恆興疾風（新竹 十興國小）」，
// 但也有「永慶高中（國中部）」這種註記學程的寫法——後者不是學校，不能當成學校抽出來。
const SCHOOL_TAIL = /(國小|國中|中學|高中|高工|高商|實中|實驗中學|國民小學|國民中學|大學|科技大學|補習班|文理補習班)$/;

/**
 * 拆解一筆名次字串。
 * 「恆興疾風（新竹 十興國小）」→ team=恆興疾風、area=新竹、school=十興國小
 * 「南投縣南崗國中」→ team=南投縣南崗國中、area=南投縣、school=南崗國中
 * 「永慶高中（國中部）」→ team=永慶高中（國中部）、school=null（括號不是學校，整串留著）
 */
export function parseTeamEntry(raw: string): Pick<RecordRow, 'raw' | 'team' | 'school' | 'area'> {
  const value = raw.trim();
  const m = value.match(/^(.+?)（(.+?)）$/);
  if (m) {
    const [, head, inside] = m;
    const parts = inside.trim().split(/[\s　]+/);
    const last = parts[parts.length - 1];
    if (SCHOOL_TAIL.test(last)) {
      return { raw: value, team: head.trim(), school: last, area: parts.length > 1 ? parts.slice(0, -1).join(' ') : null };
    }
    // 括號內不是學校（例：國中部）→ 整串就是隊名，不硬拆
    return { raw: value, team: value, school: null, area: null };
  }
  // 沒有括號時，來源可能直接寫「南投縣南崗國中」這種「縣市＋校名」
  const county = value.match(/^(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)(.+)$/);
  if (county && SCHOOL_TAIL.test(county[2])) {
    // 「高雄市立林園高級中學」的「市立」是校名的一部分，把縣市剝掉會剩下「立林園高級中學」
    // ——那不是任何一所學校的名字，而且會變成一個沒有人搜得到的網址（2026-08-27 實際產出過）。
    // 縣市後面接「立」時，整串都是校名，縣市只當作地區標記。
    if (county[2].startsWith('立')) return { raw: value, team: value, school: value, area: county[1] };
    return { raw: value, team: value, school: county[2], area: county[1] };
  }
  if (SCHOOL_TAIL.test(value)) return { raw: value, team: value, school: value, area: null };
  return { raw: value, team: value, school: null, area: null };
}

interface EventLike {
  slug: string;
  title: string;
  eventStart: string | null;
  results?: ResultBlock;
}

/** 把所有賽事的名次攤平成一列一筆。 */
export function collectRecords(events: EventLike[]): RecordRow[] {
  const rows: RecordRow[] = [];
  for (const e of events) {
    const blocks: { block: ResultBlock; division: string | null }[] = [
      { block: e.results ?? {}, division: null },
      ...publishedDivisions(e.results).map((d) => ({ block: d, division: d.name ?? null })),
    ];
    for (const { block, division } of blocks) {
      for (const [key, label] of PLACE_LABELS) {
        for (const raw of teamList(block[key])) {
          rows.push({ ...parseTeamEntry(raw), eventSlug: e.slug, eventTitle: e.title, eventStart: e.eventStart, division, place: label });
        }
      }
      for (const raw of block.merit_teams ?? []) {
        rows.push({ ...parseTeamEntry(raw), eventSlug: e.slug, eventTitle: e.title, eventStart: e.eventStart, division, place: '優勝' });
      }
    }
  }
  return rows;
}

export interface Grouped<T> { key: string; extra: T; rows: RecordRow[] }

/** 依隊名分組（同一支隊伍在不同賽事的成績併在一起），依成績筆數多的排前面。 */
export function groupByTeam(rows: RecordRow[]): Grouped<{ schools: string[] }>[] {
  const map = new Map<string, RecordRow[]>();
  for (const r of rows) (map.get(r.team) ?? map.set(r.team, []).get(r.team)!).push(r);
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      extra: { schools: [...new Set(list.map((r) => r.school).filter((s): s is string => !!s))] },
      rows: list,
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key, 'zh-Hant'));
}

/** 依學校分組。只收來源明確寫出學校的那些——不從隊名猜學校。 */
export function groupBySchool(rows: RecordRow[]): Grouped<{ area: string | null; teams: string[] }>[] {
  const map = new Map<string, RecordRow[]>();
  for (const r of rows) {
    if (!r.school) continue;
    (map.get(r.school) ?? map.set(r.school, []).get(r.school)!).push(r);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      extra: {
        area: list.map((r) => r.area).find((a): a is string => !!a) ?? null,
        teams: [...new Set(list.map((r) => r.team))],
      },
      rows: list,
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key, 'zh-Hant'));
}
