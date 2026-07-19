import { describe, it, expect } from 'vitest';
import { checkCompliance } from '../src/lib/compliance';

const spec = { drone_diameter_mm: 200, drone_weight_g_max: 500, motor_type: 'brushless' };

describe('checkCompliance', () => {
  it('全部符合 → compliant', () => {
    const r = checkCompliance({ diameter_mm: 200, weight_g: 480, motor_type: 'brushless' }, spec);
    expect(r.overall).toBe('compliant');
    expect(r.fields.every((f) => f.status === 'pass')).toBe(true);
  });
  it('超重 → 該欄 fail，總體 non_compliant', () => {
    const r = checkCompliance({ diameter_mm: 200, weight_g: 520, motor_type: 'brushless' }, spec);
    const w = r.fields.find((f) => f.key === 'weight_g');
    expect(w?.status).toBe('fail');
    expect(r.overall).toBe('non_compliant');
  });
  it('缺輸入 → 該欄 unknown，總體 partial', () => {
    const r = checkCompliance({ diameter_mm: 200 }, spec);
    expect(r.overall).toBe('partial');
    expect(r.fields.some((f) => f.status === 'unknown')).toBe(true);
  });
  it('直徑必須等於規格', () => {
    const r = checkCompliance({ diameter_mm: 250 }, spec);
    const d = r.fields.find((f) => f.key === 'diameter_mm');
    expect(d?.status).toBe('fail');
  });
});
