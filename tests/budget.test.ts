import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { batteryUnitPrice, calcBudget } from '../src/lib/budget';

// 預算試算器把 src/content 的資料當成唯一數字來源。壞掉的方式是無聲的：
// 推導不出電池單價時畫面只是少一行、算式照樣跑，沒有人會發現那一筆消失了。
// 這裡把「推導仍成立」與「算術仍正確」一起釘死。

describe('batteryUnitPrice', () => {
  it('從「一機兩電／一機六電」兩個標價反推單顆電池價', () => {
    expect(batteryUnitPrice('NT$4,350（TDA002 一機兩電）／NT$5,950（TDA204 一機六電，教育單位／課程用專案品項）')).toBe(400);
  });

  it('只有一個價位時不猜，回 null', () => {
    expect(batteryUnitPrice('NT$5,858')).toBeNull();
    expect(batteryUnitPrice('NT$47,700（含遙控器、電池 10 顆、1 年保固維修方案）')).toBeNull();
    expect(batteryUnitPrice(undefined)).toBeNull();
  });

  it('站上仍有至少一款球機推導得出電池單價（否則試算器會靜靜少一行）', () => {
    const dir = 'src/content/equipment';
    const derived = readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8').match(/^list_price:\s*(.*)$/m)?.[1]?.trim())
      .map((p) => batteryUnitPrice(p))
      .filter((v): v is number => v != null);
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0]).toBeGreaterThan(0);
  });
});

describe('calcBudget', () => {
  const base = {
    dronePrice: 10_000, activeDrones: 5, spareDrones: 2,
    batteriesPerDrone: 2, batteryUnit: 400, sparePartsRate: 0.1,
  };

  it('球機小計含備援機，備品比例只對球機小計計算', () => {
    const r = calcBudget(base);
    expect(r.droneCount).toBe(7);
    expect(r.lines.find((l) => l.label === '球機')!.amount).toBe(70_000);
    expect(r.lines.find((l) => l.label === '額外電池')!.amount).toBe(7 * 2 * 400);
    expect(r.lines.find((l) => l.label === '備品預留')!.amount).toBe(7_000);
    expect(r.total).toBe(70_000 + 5_600 + 7_000);
  });

  it('推導不出電池單價時整行不出現，而不是以 0 混進總計', () => {
    const r = calcBudget({ ...base, batteryUnit: null });
    expect(r.lines.some((l) => l.label === '額外電池')).toBe(false);
    expect(r.total).toBe(77_000);
  });

  it('備品比例 0 時不列該行', () => {
    expect(calcBudget({ ...base, sparePartsRate: 0 }).lines.some((l) => l.label === '備品預留')).toBe(false);
  });
});

// 法規文把四套賽事規則的球機重量上限對上民航法規的 250 公克註冊門檻。
// 那張表是「攤開 rulebooks 才成立」的斷言——規格改了而文章沒改，站上就會出現假話。
describe('drone-registration-and-licence 的規格斷言', () => {
  const article = readFileSync('src/content/learn/drone-registration-and-licence.md', 'utf8');
  const books = Object.fromEntries(
    readdirSync('src/content/rulebooks')
      .filter((f) => f.endsWith('.yml'))
      .map((f) => [
        f.replace(/\.yml$/, ''),
        Number(readFileSync(`src/content/rulebooks/${f}`, 'utf8').match(/^\s*drone_weight_g_max:\s*(\d+)/m)?.[1]),
      ]),
  );

  it.each([
    ['skycup-2026', 110],
    ['moe-taiwan-2026', 300],
    ['fai-f9a-b-2026', 300],
    ['fida-2026', 1100],
  ])('%s 的重量上限仍是文章寫的 %i 公克', (slug, grams) => {
    expect(books[slug]).toBe(grams);
    const shown = grams >= 1000 ? grams.toLocaleString('en-US') : String(grams);
    expect(article).toContain(`${shown} 公克`);
  });

  it('「只有天穹盃低於 250 公克門檻」仍成立', () => {
    const below = Object.entries(books).filter(([, g]) => g < 250).map(([s]) => s);
    expect(below).toEqual(['skycup-2026']);
  });
});
