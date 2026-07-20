import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

describe('design tokens', () => {
  it('保留字級量表（內容頁沿用）', () => {
    expect(css).toContain('--text-xs: 1.125rem'); // 18px
    expect(css).toContain('--text-base: 1.5rem'); // 24px
  });
  it('品牌色系以 oklch 定義', () => {
    expect(css).toContain('--color-brand-dark: oklch(26% 0.055 158)'); // 深松綠品牌骨架
    expect(css).toContain('--color-action: oklch(80% 0.18 128)');      // 電光萊姆綠招牌色
    expect(css).toContain('--color-tech: oklch(70% 0.14 72)');         // 暖琥珀結構輔助
  });
  it('舊變數重新映射到新色盤（相容既有頁面）', () => {
    expect(css).toContain('--color-link: var(--color-brand)');
    expect(css).toContain('--border-subtle: var(--color-border)');
  });
  it('提供 hex fallback', () => {
    expect(css).toContain('@supports not (color: oklch(0 0 0))');
  });
});
