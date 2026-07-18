import { describe, it, expect } from 'vitest';
import { eventStatusLabel, verificationLabel, EVENT_STATUS, RULE_SYSTEM } from '../src/lib/enums';

describe('enums', () => {
  it('賽事狀態中文標籤', () => {
    expect(eventStatusLabel('registration_open')).toBe('開放報名');
    expect(eventStatusLabel('completed')).toBe('已結束');
  });
  it('驗證狀態中文標籤', () => {
    expect(verificationLabel('official')).toBe('官方資料');
    expect(verificationLabel('source_confirmed')).toBe('已確認來源');
  });
  it('未知值回傳原字串', () => {
    expect(eventStatusLabel('zzz')).toBe('zzz');
  });
  it('狀態與規則體系清單完整', () => {
    expect(EVENT_STATUS).toContain('results_pending');
    expect(RULE_SYSTEM).toEqual(['FAI', 'FIDA', 'MOE', 'OTHER']);
  });
});
