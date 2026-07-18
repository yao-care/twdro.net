import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
describe('build smoke', () => {
  const pages = [
    'dist/index.html',
    'dist/events/index.html',
    'dist/rules/index.html',
    'dist/learn/index.html',
    'dist/about/index.html',
    'dist/about/privacy/index.html',
  ];
  for (const p of pages) {
    it(`產出 ${p}`, () => { expect(existsSync(p)).toBe(true); });
  }
});
