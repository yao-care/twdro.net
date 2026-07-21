import { describe, it, expect } from 'vitest';
import { url } from '../src/lib/url';

describe('url helper', () => {
  it('接上 base 前綴並對齊 trailingSlash:always（測試環境 BASE_URL 預設為 "/"）', () => {
    expect(url('/events')).toBe('/events/');   // 站內頁面自動補結尾斜線，避免 301
    expect(url('/')).toBe('/');                // 根路徑維持單一斜線
    expect(url('/robots.txt')).toBe('/robots.txt');  // 有副檔名的檔案不補斜線
  });
});
