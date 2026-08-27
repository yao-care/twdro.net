import { existsSync, readFileSync } from 'node:fs';
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
    'dist/teams/index.html',
    'dist/venues/index.html',
    'dist/equipment/index.html',
    'dist/rules/compare/index.html',
    'dist/equipment/compliance-check/index.html',
    'dist/events/calendar/index.html',
    'dist/events/results/index.html',
    'dist/search/index.html',
    'dist/organizations/index.html',
    'dist/organizations/oursteam/index.html',
    'dist/news/index.html',
    'dist/faq/index.html',
    'dist/sitemap/index.html',
    'dist/learn/rules-overview/index.html',
  ];
  for (const p of pages) {
    it(`產出 ${p}`, () => { expect(existsSync(p)).toBe(true); });
  }

  it('產出社群分享預覽圖', () => {
    expect(existsSync('dist/og-default.png')).toBe(true);
  });

  it('每頁宣告同一張可抓取的社群分享圖', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toContain('property="og:image" content="https://twdro.net/og-default.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image" content="https://twdro.net/og-default.png"');
  });
});
