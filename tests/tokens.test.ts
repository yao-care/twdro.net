import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

describe('design tokens', () => {
  it('最小字級為 18px', () => {
    expect(css).toContain('--text-xs: 1.125rem'); // 18px
  });
  it('正文字級 24px', () => {
    expect(css).toContain('--text-base: 1.5rem'); // 24px
  });
  it('背景與正文色用 oklch', () => {
    expect(css).toContain('oklch(0.97 0.005 250)'); // --bg-base
    expect(css).toContain('oklch(0.20 0.01 250)');  // --text-primary
  });
  it('提供 hex fallback', () => {
    expect(css).toContain('@supports not (color: oklch(0 0 0))');
  });
});
