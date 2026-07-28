import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

  it('文中提到的器材頁連結都指向實際存在的機型', () => {
    const linked = [...article.matchAll(/\]\(\/equipment\/([a-z0-9-]+)\/\)/g)].map((m) => m[1]);
    const slugs = new Set(equipment.map((e) => e.slug));
    const missing = linked.filter((s) => s !== 'compliance-check' && !slugs.has(s));
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
