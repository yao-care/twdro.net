import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SITE_SECTIONS } from '../src/lib/nav';

// 教育文裡有些句子是「攤開 src/content/equipment 才成立」的斷言（幾倍價差、只有一款有刷、
// 完售的全來自同一家…）。器材資料由人工／pipeline PR 更新，改了資料而沒改文章，
// 那些句子就會默默變成假話——站規鐵則 5 禁止站上出現沒有依據的敘述，但沒有任何機制
// 會發現。這裡把斷言釘死：資料一旦變到讓句子不成立，build 就擋下來，逼人回去改文章。
//
// 對應文章：src/content/learn/choosing-your-first-drone.md

interface Equip {
  slug: string;
  brand: string;
  model: string;
  motor: string | null;
  price: number | null;
  soldOut: boolean;
}

function loadEquipment(): Equip[] {
  const dir = 'src/content/equipment';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      const field = (k: string) => raw.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? null;
      const listPrice = field('list_price') ?? '';
      return {
        slug: f.replace(/\.yml$/, ''),
        brand: field('brand') ?? '',
        model: field('model') ?? '',
        motor: field('motor_type'),
        price: Number(listPrice.match(/^NT\$([\d,]+)/)?.[1]?.replace(/,/g, '')) || null,
        soldOut: /已完售/.test(listPrice),
      };
    });
}

const article = readFileSync('src/content/learn/choosing-your-first-drone.md', 'utf8');
const equipment = loadEquipment();
const onSale = equipment.filter((e) => !e.soldOut && e.price != null);
const soldOut = equipment.filter((e) => e.soldOut);

describe('choosing-your-first-drone 的資料斷言', () => {
  it('「最便宜和最貴的差了二十倍以上」仍成立', () => {
    const prices = onSale.map((e) => e.price!);
    expect(prices.length).toBeGreaterThan(1);
    expect(Math.max(...prices) / Math.min(...prices)).toBeGreaterThanOrEqual(20);
  });

  it('「有刷只有一款」仍成立', () => {
    expect(equipment.filter((e) => e.motor === 'brushed')).toHaveLength(1);
  });

  it('「無刷佔絕大多數」仍成立（過半）', () => {
    const brushless = equipment.filter((e) => e.motor === 'brushless').length;
    expect(brushless).toBeGreaterThan(equipment.length / 2);
  });

  it('「已完售的機型全數來自同一家廠商」仍成立', () => {
    expect(soldOut.length).toBeGreaterThan(0);
    expect(new Set(soldOut.map((e) => e.brand)).size).toBe(1);
  });

  it('「其中包含兩款 200／220 的競賽球機」仍成立', () => {
    const race = soldOut.filter((e) => /競賽/.test(e.model) && /(^|[^\d])(200|220)([^\d]|$)/.test(e.model));
    expect(race).toHaveLength(2);
  });

  it('文中提到的器材頁連結都指向實際存在的機型或工具頁', () => {
    // /equipment/ 底下除了機型明細頁，還有工具子頁（合規檢查器、預算試算器）。
    // 這份豁免清單原本是硬寫的 'compliance-check' 一個字串，於是 2026-08-27 加第二個
    // 工具頁時這個測試轉紅——問題不在新頁，在清單沒有真實來源。改讀 lib/nav 的
    // 器材區塊 subPages：那本來就是全站 IA 的單一真實來源，日後再加工具頁不必改測試。
    const toolSlugs = new Set(
      (SITE_SECTIONS.find((sec) => sec.urlBase === '/equipment/')?.subPages ?? [])
        .map((item) => item.href.replace(/^\/equipment\/|\/$/g, '')),
    );
    const linked = [...article.matchAll(/\]\(\/equipment\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
    const slugs = new Set(equipment.map((e) => e.slug));
    const missing = linked.filter((s) => !toolSlugs.has(s) && !slugs.has(s));
    expect(missing).toEqual([]);
  });

  it('嵌入的比價表宣告仍在 frontmatter（拿掉就沒有價格資料可看）', () => {
    expect(article).toMatch(/^embed:\s*equipment-price-table$/m);
  });
});

// 對應文章：src/content/learn/skycup-explained.md
// 文中的規格比較表逐格對應 rulebooks/*.yml 的 competition_spec，規則細節則引自
// rules/skycup-2026-*.yml 的 summary。任一邊被修，文章就會與站內資料互相矛盾。

function rulebookSpec(slug: string): Record<string, string> {
  const raw = readFileSync(`src/content/rulebooks/${slug}.yml`, 'utf8');
  const block = raw.split(/^competition_spec:\s*$/m)[1] ?? '';
  const spec: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^ {2}(\w+):\s*(.*)$/);
    if (!m) { if (line.trim() && !line.startsWith('  ')) break; continue; }
    spec[m[1]] = m[2].replace(/^'|'$/g, '').trim();
  }
  return spec;
}

const ruleSummary = (slug: string) =>
  readFileSync(`src/content/rules/${slug}.yml`, 'utf8').match(/^summary:\s*(.*)$/m)?.[1] ?? '';

describe('skycup-explained 的資料斷言', () => {
  const skycup = rulebookSpec('skycup-2026');
  const fai = rulebookSpec('fai-f9a-b-2026');
  const moe = rulebookSpec('moe-taiwan-2026');
  const fida = rulebookSpec('fida-2026');

  it('規格比較表的四列數字與規則書一致', () => {
    expect([skycup.drone_diameter_mm, skycup.drone_weight_g_max]).toEqual(['200', '110']);
    expect(skycup.battery_cells).toContain('2S');
    expect([fai.drone_diameter_mm, fai.drone_weight_g_max, fai.battery_cells]).toEqual(['200', '300', '4S']);
    expect([moe.drone_diameter_mm, moe.drone_weight_g_max]).toEqual(['200', '300']);
    expect([fida.drone_diameter_mm, fida.drone_weight_g_max]).toEqual(['400', '1100']);
  });

  it('「重量上限只有它們的三分之一多一點」仍成立', () => {
    const ratio = Number(skycup.drone_weight_g_max) / Number(fai.drone_weight_g_max);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(0.45);
  });

  it('「每隊 3 人、1 名得分手」與規則書一致', () => {
    expect([skycup.active_players_min, skycup.active_players_max]).toEqual(['3', '3']);
    expect(ruleSummary('skycup-2026-team')).toContain('指定 1 名得分手');
  });

  it('文中引用的天穹盃規則細節仍在對應條文裡', () => {
    expect(ruleSummary('skycup-2026-drone-spec')).toContain('1020 有刷馬達');
    expect(ruleSummary('skycup-2026-drone-spec')).toContain('25mW 以下');
    expect(ruleSummary('skycup-2026-eligibility')).toContain('僅設「有刷組」一組');
    expect(ruleSummary('skycup-2026-scoring-fouls')).toContain('違規累積滿 2 點扣總分 1 分');
    expect(ruleSummary('skycup-2026-arena')).toContain('長 6 公尺、寬 3 公尺、高 3 公尺');
    expect(ruleSummary('skycup-2026-format')).toContain('每局為 3 分鐘');
  });

  it('「四套規則書裡只有天穹盃用『無人機飛球』」仍成立', () => {
    const named = readdirSync('src/content/rulebooks')
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => /飛球/.test(readFileSync(`src/content/rulebooks/${f}`, 'utf8').match(/^name:\s*(.*)$/m)?.[1] ?? ''));
    expect(named).toEqual(['skycup-2026.yml']);
  });

  it('「BALKIN V2 重量與電池落在天穹盃範圍內、但未標馬達型式」仍成立', () => {
    const balkin = equipment.find((e) => e.slug === 'soeasy-balkin-v2');
    const raw = readFileSync('src/content/equipment/soeasy-balkin-v2.yml', 'utf8');
    expect(Number(raw.match(/^weight_g:\s*(\d+)$/m)?.[1])).toBeLessThanOrEqual(
      Number(skycup.drone_weight_g_max),
    );
    expect(raw).toMatch(/^battery_voltage:\s*2S/m);
    expect(balkin?.motor).toBeNull(); // 未標馬達型式，文中才會寫「要向廠商確認」
  });
});

// 對應文章：src/content/learn/moe-national-competition.md
// 三階段的時間、地點、晉級門檻與獎金全部引自 events/2026-moe-*.yml 與
// rulebooks/moe-taiwan-2026.yml；賽事延期或獎金調整而文章沒跟著改，這裡會擋下來。

const eventRaw = (slug: string) => readFileSync(`src/content/events/${slug}.yml`, 'utf8');

describe('moe-national-competition 的資料斷言', () => {
  const moe = rulebookSpec('moe-taiwan-2026');

  it('三階段的獎金級距與賽事資料一致', () => {
    expect(eventRaw('2026-moe-regional')).toContain('冠軍獎金 1 萬元／亞軍 5 千元／季軍 3 千元');
    expect(eventRaw('2026-moe-semifinal')).toContain('各分組前 3 名各獲獎金 2 萬元');
    expect(eventRaw('2026-moe-final-presidential')).toContain('冠軍獎金 5 萬元／亞軍 3 萬元');
  });

  it('「準決賽每隊 2 萬比分區賽冠軍 1 萬還高」仍成立', () => {
    const num = (slug: string, re: RegExp) => {
      const m = eventRaw(slug).match(re);
      return Number(m?.[1]) * (m?.[2] === '萬' ? 10000 : 1000);
    };
    const regionalChampion = num('2026-moe-regional', /冠軍獎金 (\d+) (萬|千)元/);
    const semifinalTop3 = num('2026-moe-semifinal', /前 3 名各獲獎金 (\d+) (萬|千)元/);
    expect(semifinalTop3).toBeGreaterThan(regionalChampion);
  });

  it('三階段的晉級門檻與賽事資料一致', () => {
    // 2026-08-27 用字對齊來源：報導寫的是「各分區前三名（共九隊）將晉級決賽」，
    // 原本站上寫「各組前 3 名」——分區與組別在這套賽制裡不是同一件事。
    expect(eventRaw('2026-moe-regional')).toContain('各分區前 3 名（共九隊）晉級準決賽');
    expect(eventRaw('2026-moe-semifinal')).toContain('各分組前 2 名晉級總統盃決賽');
  });

  it('三階段的時間與場館與賽事資料一致', () => {
    expect(eventRaw('2026-moe-regional')).toMatch(/event_start: "2026-07-01"/);
    expect(eventRaw('2026-moe-regional')).toMatch(/event_end: "2026-08-31"/);
    expect(eventRaw('2026-moe-semifinal')).toMatch(/event_start: "2026-10-02"/);
    expect(eventRaw('2026-moe-semifinal')).toContain('國立臺灣大學綜合體育館');
    expect(eventRaw('2026-moe-final-presidential')).toContain('大臺南會展中心');
  });

  it('「上場 3 至 5 人、2 名替補」與規則書一致（且比天穹盃有彈性）', () => {
    expect([moe.active_players_min, moe.active_players_max, moe.substitutes]).toEqual(['3', '5', '2']);
    const sky = rulebookSpec('skycup-2026');
    expect(Number(moe.active_players_max)).toBeGreaterThan(Number(sky.active_players_max));
  });

  it('「規格採 FAI F9A-B、直徑 20 公分」仍成立', () => {
    expect(ruleSummary('moe-taiwan-2026-spec')).toContain('FAI F9A-B');
    expect(ruleSummary('moe-taiwan-2026-spec')).toContain('教育部首次舉辦');
    expect(moe.drone_diameter_mm).toBe(rulebookSpec('fai-f9a-b-2026').drone_diameter_mm);
    expect(moe.goal_size).toContain('內徑 40');
  });

  it('「三個組別」與規則書一致', () => {
    expect(ruleSummary('moe-taiwan-2026-divisions')).toContain('國中小組、高中組、大專校院組三個組別');
  });
});

describe('embed 宣告', () => {
  it('每篇文章的 embed_series 都對得到實際賽事', () => {
    const seriesInEvents = new Set(
      readdirSync('src/content/events')
        .filter((f) => f.endsWith('.yml'))
        .map((f) => eventRaw(f.replace(/\.yml$/, '')).match(/^event_series:\s*(.*)$/m)?.[1]?.trim())
        .filter(Boolean),
    );
    const declared = readdirSync('src/content/learn')
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(`src/content/learn/${f}`, 'utf8').match(/^embed_series:\s*(.*)$/m)?.[1]?.trim())
      .filter((v): v is string => Boolean(v));
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((s) => !seriesInEvents.has(s))).toEqual([]);
  });
});

// ── 以下對應 2026-07-28 新增／改寫的四篇（entry-cost、edutech-cup-explained、
//    taiwan-international-results、who-promotes-drone-soccer-taiwan）。
//    共同原則不變：文章裡凡是「攤開站內資料才成立」的句子，都在這裡釘死。

const teamRaw = (slug: string) => readFileSync(`src/content/teams/${slug}.yml`, 'utf8');
const newsRaw = (slug: string) => readFileSync(`src/content/news/${slug}.yml`, 'utf8');

describe('entry-cost 的資料斷言', () => {
  it('「兩千多元的材料包到四萬多元的整套方案」仍成立', () => {
    const prices = onSale.map((e) => e.price!);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(2000);
    expect(Math.min(...prices)).toBeLessThan(3000);
    expect(Math.max(...prices)).toBeGreaterThanOrEqual(40000);
    expect(Math.max(...prices)).toBeLessThan(50000);
  });

  it('「最貴的是含遙控器與多顆電池的整套方案」仍成立', () => {
    const top = onSale.reduce((a, b) => (a.price! > b.price! ? a : b));
    const raw = readFileSync(`src/content/equipment/${top.slug}.yml`, 'utf8');
    expect(raw).toMatch(/含遙控器/);
  });

  it('「同款有一機兩電與一機六電兩個價」仍成立（電池成本的參考點）', () => {
    const raw = readFileSync('src/content/equipment/oursteam-s4a.yml', 'utf8');
    expect(raw).toContain('一機兩電');
    expect(raw).toContain('一機六電');
    expect((raw.match(/NT\$/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('edutech-cup-explained 的資料斷言', () => {
  it('日期、場地與主辦組合與賽事資料一致', () => {
    const raw = eventRaw('2026-edutech-cup-newtaipei');
    expect(raw).toMatch(/event_start: "2026-08-08"/);
    expect(raw).toContain('新北市立三民高中 逸仙堂');
    expect(raw).toContain('新北市教育局／台北市電腦商業同業公會／奧斯丁國際');
    expect(raw).toContain('event_series: 臺灣教育科技盃無人機足球');
  });

  it('「新增無刷馬達組」「採 FAI F9A-B 與 FIDA CL20」仍有來源', () => {
    const raw = newsRaw('2026-06-21-edutech-newtaipei-open');
    expect(raw).toContain('無刷馬達組');
    expect(raw).toContain('FAI F9A-B 與 FIDA CL20');
  });

  it('「天穹盃只設有刷組」的對照仍成立', () => {
    expect(ruleSummary('skycup-2026-eligibility')).toContain('僅設「有刷組」一組');
  });
});

describe('taiwan-international-results 的資料斷言', () => {
  it('臺北市代表隊的成績與隊伍資料一致', () => {
    const raw = teamRaw('taipei-city-drone-soccer-team');
    expect(raw).toContain('7 所學校');
    expect(raw).toContain('Cracing 項目冠軍');
    expect(raw).toContain('Class20 殿軍');
    expect(raw).toContain('未來之星');
    expect(raw).toContain('首屆 FIDA 無人機足球世界盃');
  });

  it('國家代表隊的編制與賽事與隊伍資料一致', () => {
    const raw = teamRaw('taiwan-national-team');
    expect(raw).toContain('40 公分級（F9A-A）1 隊與 20 公分級（F9A-B）2 隊');
    expect(raw).toMatch(/國際航空總會（FAI）/);
    expect(raw).toContain('上海');
  });

  it('「臺灣首座 FIDA 40 Class 標準場地」仍有來源', () => {
    expect(teamRaw('hwahsing-drone-soccer')).toContain('全國首座 FIDA 40 Class 標準賽制場地');
    expect(newsRaw('2026-04-11-cdsa-fida-arena')).toContain('臺灣首座 FIDA 40 Class');
  });

  it('「2028 洛杉磯奧運表演賽、2029 亞運正式項目」仍有來源', () => {
    expect(newsRaw('2026-07-18-nantou-triple')).toContain('2028 洛杉磯奧運表演賽');
    expect(newsRaw('2026-07-18-nantou-triple')).toContain('2029 亞運正式項目');
  });
});

describe('who-promotes-drone-soccer-taiwan 的資料斷言', () => {
  const orgs = readdirSync('src/content/organizations')
    .filter((f) => f.endsWith('.yml'))
    .map((f) => ({ slug: f.replace(/\.yml$/, ''), raw: readFileSync(`src/content/organizations/${f}`, 'utf8') }));

  it('文中分的四類單位在資料裡都還有成員', () => {
    const types = new Set(orgs.map((o) => o.raw.match(/^org_type:\s*(.*)$/m)?.[1]?.trim()));
    for (const t of ['government', 'association', 'school', 'vendor']) expect(types).toContain(t);
  });

  it('「兩個協會」仍成立，且分屬 CDSA 與台灣無人機競技發展協會', () => {
    const assoc = orgs.filter((o) => /^org_type:\s*association$/m.test(o.raw)).map((o) => o.slug).sort();
    expect(assoc).toEqual(['cdsa', 'tdrupa']);
  });

  it('文中提到的單位頁連結都指向實際存在的單位', () => {
    const article = readFileSync('src/content/learn/who-promotes-drone-soccer-taiwan.md', 'utf8');
    const linked = [...article.matchAll(/\]\(\/organizations\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
    const slugs = new Set(orgs.map((o) => o.slug));
    expect(linked.filter((s) => !slugs.has(s))).toEqual([]);
  });

  it('文中提到的隊伍頁連結都指向實際存在的隊伍或工具頁', () => {
    // /teams/ 底下除了隊伍明細，還有工具子頁（成績反查）。豁免清單讀 lib/nav 的
    // SITE_SECTIONS subPages——與 equipment 那次同一個修法，IA 本來就有單一真實來源，
    // 日後再加子頁不必回來改測試（2026-08-27 連 /teams/records/ 時踩到）。
    const toolSlugs = new Set(
      (SITE_SECTIONS.find((sec) => sec.urlBase === '/teams/')?.subPages ?? [])
        .map((item) => item.href.replace(/^\/teams\/|\/$/g, '')),
    );
    const slugs = new Set(readdirSync('src/content/teams').filter((f) => f.endsWith('.yml')).map((f) => f.replace(/\.yml$/, '')));
    for (const file of ['who-promotes-drone-soccer-taiwan', 'taiwan-international-results']) {
      const md = readFileSync(`src/content/learn/${file}.md`, 'utf8');
      const linked = [...md.matchAll(/\]\(\/teams\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
      expect(linked.filter((s) => !toolSlugs.has(s) && !slugs.has(s))).toEqual([]);
    }
  });
});

describe('taiwan-competitions-overview 的資料斷言', () => {
  const overview = readFileSync('src/content/learn/taiwan-competitions-overview.md', 'utf8');

  // 2026-08-03 改寫：原本寫死「expect(series.size).toBe(N)」，每新增一個賽事系列就得手動
  // 把常數 +1（本日一路從 4 撞到 7）。守門的用意是「文章宣稱的系列數要跟實際資料一致」，
  // 所以改成從文章自己的文字解析出宣稱值再比對——加了系列卻忘了改文章一樣會擋下來，
  // 但正確更新文章之後不必再回頭動測試。
  // 中文數字對照。2026-08-27 擴到二十：系列數一過十，原本的表就查不到「十一」，
  // 而失敗訊息會變成 `expected undefined to be truthy`——看起來像測試壞了，其實是資料長大了。
  const ZH_NUM: Record<string, number> = {
    二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
  };

  it('文章宣稱的賽事系列數與實際資料一致，且逐列點名的系列都還在', () => {
    const series = new Set(
      readdirSync('src/content/events')
        .filter((f) => f.endsWith('.yml'))
        .map((f) => eventRaw(f.replace(/\.yml$/, '')).match(/^event_series:\s*(.*)$/m)?.[1]?.trim())
        .filter(Boolean),
    );
    // 文章標題寫「N 個系列一次看懂」，內文寫「本站目前收錄 N 個系列」，兩處都要對得上資料
    const claimed = overview.match(/本站目前收錄([一二三四五六七八九十]{1,3})個系列/)?.[1];
    expect(claimed).toBeTruthy();
    expect(ZH_NUM[claimed!]).toBe(series.size);
    expect(overview).toContain(`${claimed}個系列一次看懂`);
    // 表格逐列點名的系列，資料裡都要還在（改名或下架就會擋下來）
    expect(series).toContain('教育部全國無人機足球競賽');
    expect(series).toContain('天穹盃');
    expect(series).toContain('臺灣教育科技盃無人機足球');
    expect(series).toContain('秀傳夏季無人機嘉年華會');
    // 2026-08-03 加：縣市選拔賽（全國賽之前的那一關，先前整層缺漏）
    expect(series).toContain('縣市級賽事');
  });

  it('秀傳盃「全臺首度由醫療單位主辦」與主辦單位仍有來源', () => {
    // 2026-08-27 用字對齊實際報導：多家媒體寫的是「全台首度由醫療單位主辦」，
    // 賽事正式名稱是「第一屆秀傳盃無人機足球賽」（原本站上寫「秀傳盃無人機足球友誼賽」）。
    const raw = eventRaw('2026-shuang-cup');
    expect(raw).toContain('全臺首度由醫療單位主辦');
    expect(raw).toContain('秀傳醫療體系／奧斯丁國際');
    expect(raw).toContain('title: 第一屆秀傳盃無人機足球賽');
  });

  it('樞紐文連出的四篇專篇都存在（避免改檔名後變死連結）', () => {
    const linked = [...overview.matchAll(/\]\(\/learn\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
    const slugs = new Set(readdirSync('src/content/learn').filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
    expect(linked.filter((s) => !slugs.has(s))).toEqual([]);
    for (const must of ['moe-national-competition', 'skycup-explained', 'edutech-cup-explained', 'taiwan-international-results']) {
      expect(linked).toContain(must);
    }
  });
});

// naming-drone-soccer-vs-flyball 說「廠商型號常寫成『足球無人機』」，並點名四款。
// 那是攤開 src/content/equipment 才成立的斷言——型號改名或機型下架，句子就默默變成假話。
// 這個字序值得單獨守：GSC 近 90 天「足球無人機」有曝光（pos 59，落在首頁），
// 而搜尋引擎不一定把它和「無人機足球」當成同一個詞。
describe('naming-drone-soccer-vs-flyball 的型號斷言', () => {
  const article = readFileSync('src/content/learn/naming-drone-soccer-vs-flyball.md', 'utf8');
  const models = equipment.map((e) => e.model);

  it('確實有型號用「足球無人機」這個字序', () => {
    expect(models.filter((m) => m.includes('足球無人機')).length).toBeGreaterThanOrEqual(4);
  });

  it('文中點名的四款都還在，連結也指得到', () => {
    for (const slug of ['arklab-hjt006', 'oursteam-fb200', 'oursteam-s4a-tda196', 'soeasy-balkin-v2']) {
      expect(article).toContain(`/equipment/${slug}/`);
      expect(equipment.some((e) => e.slug === slug)).toBe(true);
      expect(equipment.find((e) => e.slug === slug)!.model).toContain('足球無人機');
    }
  });
});
