import { describe, it, expect } from 'vitest';
import { compareRulebooks, SPEC_FIELDS } from '../src/lib/compare';

describe('compareRulebooks', () => {
  const books = [
    { id: 'fai', name: 'FAI', spec: { drone_diameter_mm: 200, active_players_max: 5 } },
    { id: 'moe', name: 'MOE', spec: { drone_diameter_mm: 200, active_players_max: 3 } },
  ];
  it('每個欄位輸出兩本規則的值', () => {
    const rows = compareRulebooks(books);
    const diameter = rows.find((r) => r.key === 'drone_diameter_mm');
    expect(diameter?.values).toEqual([200, 200]);
    const players = rows.find((r) => r.key === 'active_players_max');
    expect(players?.values).toEqual([5, 3]);
  });
  it('某本缺值時該欄以 undefined 呈現，但只要有一本有值就保留該列', () => {
    const rows = compareRulebooks([
      { id: 'a', name: 'A', spec: { drone_diameter_mm: 200 } },
      { id: 'b', name: 'B', spec: {} },
    ]);
    const diameter = rows.find((r) => r.key === 'drone_diameter_mm');
    expect(diameter?.values).toEqual([200, undefined]);
  });
  it('所有選中規則書皆無值的欄位不顯示（避免整排空白）', () => {
    const rows = compareRulebooks(books);
    // books 皆未填 motor_type / arena_size，這些列應被略過
    expect(rows.find((r) => r.key === 'motor_type')).toBeUndefined();
    expect(rows.find((r) => r.key === 'arena_size')).toBeUndefined();
  });
  it('保留的欄位維持 SPEC_FIELDS 的相對順序', () => {
    const rows = compareRulebooks(books);
    const keys = rows.map((r) => r.key);
    const order = SPEC_FIELDS.map((f) => f.key);
    expect(keys).toEqual(order.filter((k) => keys.includes(k)));
    // 本例只有這兩欄有值
    expect(keys).toEqual(['drone_diameter_mm', 'active_players_max']);
  });
});
