import { describe, it, expect } from 'vitest';
import { url } from '../src/lib/url';

describe('url helper', () => {
  it('接上 base 前綴（測試環境 BASE_URL 預設為 "/"）', () => {
    expect(url('/events')).toBe('/events');
    expect(url('/')).toBe('/');
  });
});
