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
  it('缺值以 undefined 呈現', () => {
    const rows = compareRulebooks([{ id: 'x', name: 'X', spec: {} }]);
    const diameter = rows.find((r) => r.key === 'drone_diameter_mm');
    expect(diameter?.values).toEqual([undefined]);
  });
  it('欄位順序與標籤來自 SPEC_FIELDS', () => {
    const rows = compareRulebooks(books);
    expect(rows.map((r) => r.key)).toEqual(SPEC_FIELDS.map((f) => f.key));
  });
});
