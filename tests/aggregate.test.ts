import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { aggHref, yearOf } from '../src/lib/aggregate.mjs';
import { schoolFromEntry } from '../src/lib/lastmod.mjs';
import { parseTeamEntry } from '../src/lib/records';

// 前置：需先執行 `npm run build`
//
// 彙整頁（縣市／系列／年度／學校）全部是由既有資料交叉產生的，所以它們的壞法是
// 「整層安靜地消失」：少一頁、或有頁卻沒有入口、或沒有 lastmod，畫面上都看不出來。
// /organizations/ 卡在「從未被爬取」38 天就是因為只有頁尾樣板連結。

const EVENT_DIR = 'src/content/events';
const events = readdirSync(EVENT_DIR).filter((f) => f.endsWith('.yml'))
  .map((f) => ({ file: f, raw: readFileSync(`${EVENT_DIR}/${f}`, 'utf8') }))
  .filter((e) => !/^status:\s*draft/m.test(e.raw));

const field = (raw: string, key: string, indented = false) =>
  raw.match(new RegExp(`${indented ? '^\\s+' : '^'}${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;

const seriesNames = [...new Set(events.map((e) => field(e.raw, 'event_series')).filter((s): s is string => !!s))];
const years = [...new Set(events.map((e) => yearOf(field(e.raw, 'event_start', true))).filter((y): y is string => !!y))];
// 直接從 YAML 的名次欄位抽學校：三種寫法都要收（單值、行內陣列、merit_teams）。
const schools = [...new Set(
  events.flatMap((e) =>
    [...e.raw.matchAll(/^\s+(?:champion_team|runner_up_team|third_place_team|merit_teams):\s*(.+)$/gm)]
      .flatMap((m) => {
        const v = m[1].trim();
        return v.startsWith('[') ? v.slice(1, -1).split(',') : [v];
      })
      .map((x) => parseTeamEntry(x.trim().replace(/^['"]|['"]$/g, '')).school)
      .filter((x): x is string => !!x),
  ),
)];

const eventsIndex = readFileSync('dist/events/index.html', 'utf8');
const humanSitemap = readFileSync('dist/sitemap/index.html', 'utf8');
const xmlSitemap = readFileSync('dist/sitemap-0.xml', 'utf8');

describe('aggHref', () => {
  it('中文段落一律 encode，HTML 與 sitemap 才對得上', () => {
    expect(aggHref('/events/series/', '天穹盃')).toBe('/events/series/%E5%A4%A9%E7%A9%B9%E7%9B%83/');
    expect(aggHref('/events/year/', '2026')).toBe('/events/year/2026/');
  });
  it('yearOf 只認得出 YYYY 開頭的日期', () => {
    expect(yearOf('2026-08-27')).toBe('2026');
    expect(yearOf(undefined)).toBeNull();
    expect(yearOf('未定')).toBeNull();
  });
});

describe('賽事系列頁', () => {
  it('資料裡的每個系列都產得出頁，且三個入口都在', () => {
    expect(seriesNames.length).toBeGreaterThan(5);
    for (const name of seriesNames) {
      expect(existsSync(`dist/events/series/${name}/index.html`), name).toBe(true);
      const href = aggHref('/events/series/', name);
      expect(eventsIndex, `${name} 沒出現在 /events/`).toContain(href);
      expect(humanSitemap, `${name} 沒出現在人類版網站地圖`).toContain(href);
      expect(xmlSitemap, `${name} 沒進 XML sitemap`).toContain(`https://twdro.net${href}`);
    }
  });
});

describe('年度頁', () => {
  it('每個年度都產得出頁，且入口都在', () => {
    expect(years.length).toBeGreaterThan(1);
    for (const y of years) {
      expect(existsSync(`dist/events/year/${y}/index.html`), y).toBe(true);
      expect(eventsIndex).toContain(aggHref('/events/year/', y));
      expect(xmlSitemap).toContain(`https://twdro.net${aggHref('/events/year/', y)}`);
    }
  });
});

describe('學校頁', () => {
  const recordsPage = readFileSync('dist/teams/records/index.html', 'utf8');

  it('成績名單上的每一所學校都產得出頁，且從成績反查連得過去', () => {
    expect(schools.length).toBeGreaterThan(5);
    for (const name of schools) {
      expect(existsSync(`dist/teams/school/${name}/index.html`), name).toBe(true);
      expect(recordsPage, `${name} 在成績反查上沒有連結`).toContain(aggHref('/teams/school/', name));
      expect(xmlSitemap, `${name} 沒進 XML sitemap`).toContain(`https://twdro.net${aggHref('/teams/school/', name)}`);
    }
  });

  it('「市立／縣立」不會被誤剝成不存在的校名', () => {
    expect(schools).not.toContain('立林園高級中學');
    expect(existsSync('dist/teams/school/立林園高級中學/index.html')).toBe(false);
  });
});

describe('lastmod 的學校抽取與頁面端同一套規則', () => {
  it('兩邊對同一批字串的判斷一致（走鐘的樣子是某個學校頁沒有 lastmod）', () => {
    const samples = [
      '恆興疾風（新竹 十興國小）', '永慶高中（國中部）', '南投縣南崗國中',
      '高雄市立林園高級中學', '蒜頭國小', 'APEX TEAM', '多元智趣2',
    ];
    for (const raw of samples) {
      expect(schoolFromEntry(raw), raw).toBe(parseTeamEntry(raw).school);
    }
  });
});

describe('場館', () => {
  it('賽事用到的場館都已建檔（單一場館字串才算，複合字串另計）', () => {
    const venueNames = new Set(
      readdirSync('src/content/venues').filter((f) => f.endsWith('.yml'))
        .map((f) => field(readFileSync(`src/content/venues/${f}`, 'utf8'), 'name'))
        .filter((n): n is string => !!n),
    );
    const missing = events
      .map((e) => field(e.raw, 'venue_name', true))
      .filter((v): v is string => !!v)
      // 「A（決賽）／B（初賽）」這種一格兩館的寫法不是單一場館，不該建成一筆。
      .filter((v) => !v.includes('／'))
      .filter((v) => !venueNames.has(v));
    expect([...new Set(missing)]).toEqual([]);
  });
});
