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
