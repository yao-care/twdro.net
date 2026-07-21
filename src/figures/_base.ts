// 圖表共用底座：統一畫框、標題、箭頭 marker、reduced-motion 判斷，
// 以及各篇 learn 示意圖共用的可重複使用元件（球門環／球機／前鋒光環／
// 引線標註／節點方框／打勾／飛行路徑數學／動畫迴圈）。
// 讓 15 張圖風格一致、少重工、好維護。
import * as d3 from 'd3';

export type Sel = d3.Selection<any, unknown, null, undefined>;
export type Pt = { x: number; y: number };

export interface Scaffold {
  d3: typeof d3;
  svg: Sel;
  defs: Sel;
  W: number;
  H: number;
  reduce: boolean;
}

export interface ScaffoldOpts {
  W?: number;
  H?: number;
  title?: string;
}

/**
 * 建立一張帶圓角底框與標題的 SVG，並回傳常用工具。
 * 所有顏色一律走 CSS token（var(--color-*)），自動吃站台深/淺色主題。
 */
export function scaffold(mount: HTMLElement, opts: ScaffoldOpts = {}): Scaffold {
  const W = opts.W ?? 640;
  const H = opts.H ?? 300;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  mount.innerHTML = '';

  const svg = d3
    .select(mount)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%')
    .style('height', 'auto')
    .style('font-family', 'inherit')
    .attr('role', 'img') as unknown as Sel;

  const defs = svg.append('defs') as unknown as Sel;
  // 共用箭頭 marker
  defs
    .append('marker')
    .attr('id', 'fig-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M0 0 L10 5 L0 10 z')
    .attr('fill', 'var(--color-text-muted)');

  // 底框
  svg
    .append('rect')
    .attr('x', 4)
    .attr('y', 4)
    .attr('width', W - 8)
    .attr('height', H - 8)
    .attr('rx', 12)
    .attr('fill', 'var(--color-surface-muted)')
    .attr('stroke', 'var(--color-border)');

  if (opts.title) {
    svg
      .append('text')
      .attr('x', W / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', 15)
      .attr('font-weight', 700)
      .attr('fill', 'var(--color-text)')
      .text(opts.title);
  }

  return { d3, svg, defs, W, H, reduce };
}

/** 兩隊代表色（藍 A／橘 B），與站台品牌一致。 */
export const TEAM_A = 'var(--color-tech)';
export const TEAM_B = 'var(--color-action)';

// ─────────────────────────────────────────────────────────────
// 飛行路徑數學（what-is-drone-soccer／striker-explained／starting… 共用）
// ─────────────────────────────────────────────────────────────

/** 純量線性插值。 */
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** 兩點線性插值。 */
export const lerpPt = (a: Pt, b: Pt, u: number): Pt => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });

/** 二次貝茲曲線取點（a 起點、c 控制點、b 終點、u∈[0,1]）。 */
export const bezPt = (a: Pt, c: Pt, b: Pt, u: number): Pt => {
  const m = 1 - u;
  return { x: m * m * a.x + 2 * m * u * c.x + u * u * b.x, y: m * m * a.y + 2 * m * u * c.y + u * u * b.y };
};

// ─────────────────────────────────────────────────────────────
// 動畫迴圈：reduce 時不啟動（由呼叫端另畫靜態畫面）；
// 否則每幀以「已用時間 / 週期」正規化後的 t∈[0,1) 及原始 elapsed 呼叫 tick。
// ─────────────────────────────────────────────────────────────
export function loop(reduce: boolean, periodMs: number, tick: (t: number, elapsed: number) => void): void {
  if (reduce) return;
  d3.timer((elapsed) => {
    tick((elapsed % periodMs) / periodMs, elapsed);
  });
}

// ─────────────────────────────────────────────────────────────
// arena 家族元件
// ─────────────────────────────────────────────────────────────

/** 球門環（縱向橢圓環）。回傳 selection，方便後續縮放/變色。 */
export function goalRing(
  sel: Sel,
  opts: { cx: number; cy: number; rx?: number; ry?: number; color?: string; width?: number },
): Sel {
  return sel
    .append('ellipse')
    .attr('cx', opts.cx)
    .attr('cy', opts.cy)
    .attr('rx', opts.rx ?? 9)
    .attr('ry', opts.ry ?? 30)
    .attr('fill', 'none')
    .attr('stroke', opts.color ?? 'var(--color-tech)')
    .attr('stroke-width', opts.width ?? 6) as unknown as Sel;
}

/** 一台球機／一顆球（實心圓，可選外框）。回傳 selection，方便移動。 */
export function drone(
  sel: Sel,
  opts: { x: number; y: number; r?: number; fill?: string; stroke?: string; strokeWidth?: number },
): Sel {
  const c = sel
    .append('circle')
    .attr('cx', opts.x)
    .attr('cy', opts.y)
    .attr('r', opts.r ?? 9)
    .attr('fill', opts.fill ?? 'var(--color-ball)');
  if (opts.stroke) c.attr('stroke', opts.stroke).attr('stroke-width', opts.strokeWidth ?? 1);
  return c as unknown as Sel;
}

/** 前鋒虛線光環（標示「被指定的前鋒」）。回傳 selection，方便移動。 */
export function strikerHalo(sel: Sel, opts: { x: number; y: number; r?: number; color?: string }): Sel {
  return sel
    .append('circle')
    .attr('cx', opts.x)
    .attr('cy', opts.y)
    .attr('r', opts.r ?? 14)
    .attr('fill', 'none')
    .attr('stroke', opts.color ?? 'var(--color-text)')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '3 2') as unknown as Sel;
}

// ─────────────────────────────────────────────────────────────
// 引線標註：從標籤側一點畫細線（帶箭頭）指向目標，再放標題＋說明。
// ─────────────────────────────────────────────────────────────
export function annotate(
  sel: Sel,
  opts: {
    from: Pt; // 標籤側起點（標題文字錨點）
    to: Pt; // 指向的目標點
    title: string;
    desc?: string;
    color?: string; // 標題色
    anchor?: 'start' | 'middle' | 'end';
  },
): Sel {
  const g = sel.append('g') as unknown as Sel;
  const anchor = opts.anchor ?? 'start';
  g.append('line')
    .attr('x1', opts.from.x)
    .attr('y1', opts.from.y - 4)
    .attr('x2', opts.to.x)
    .attr('y2', opts.to.y)
    .attr('stroke', 'var(--color-text-muted)')
    .attr('stroke-width', 1.2)
    .attr('marker-end', 'url(#fig-arrow)');
  g.append('text')
    .attr('x', opts.from.x)
    .attr('y', opts.from.y)
    .attr('text-anchor', anchor)
    .attr('font-size', 12.5)
    .attr('font-weight', 700)
    .attr('fill', opts.color ?? 'var(--color-text)')
    .text(opts.title);
  if (opts.desc)
    g.append('text')
      .attr('x', opts.from.x)
      .attr('y', opts.from.y + 15)
      .attr('text-anchor', anchor)
      .attr('font-size', 10.5)
      .attr('fill', 'var(--color-text-muted)')
      .text(opts.desc);
  return g;
}

// ─────────────────────────────────────────────────────────────
// 通用小元件
// ─────────────────────────────────────────────────────────────

/** 圓角方框（節點/卡片底）。回傳 rect selection，方便切換點亮狀態。 */
export function roundedBox(
  sel: Sel,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    rx?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  },
): Sel {
  return sel
    .append('rect')
    .attr('x', opts.x)
    .attr('y', opts.y)
    .attr('width', opts.w)
    .attr('height', opts.h)
    .attr('rx', opts.rx ?? 8)
    .attr('fill', opts.fill ?? 'var(--color-surface)')
    .attr('stroke', opts.stroke ?? 'var(--color-border)')
    .attr('stroke-width', opts.strokeWidth ?? 1.5) as unknown as Sel;
}

/** 置中（預設）文字。回傳 text selection。 */
export function centerText(
  sel: Sel,
  opts: {
    x: number;
    y: number;
    text: string;
    size?: number;
    weight?: number;
    fill?: string;
    anchor?: 'start' | 'middle' | 'end';
  },
): Sel {
  return sel
    .append('text')
    .attr('x', opts.x)
    .attr('y', opts.y)
    .attr('text-anchor', opts.anchor ?? 'middle')
    .attr('font-size', opts.size ?? 12)
    .attr('font-weight', opts.weight ?? 400)
    .attr('fill', opts.fill ?? 'var(--color-text)')
    .text(opts.text) as unknown as Sel;
}

/**
 * 打勾記號，以 stroke-dashoffset 揭示。
 * 回傳 { path, reveal(p) }：呼叫 reveal(0)=未勾、reveal(1)=完全勾選（可做動畫）。
 * 座標 (x,y) 為打勾外接方框左上角，size 為方框邊長。
 */
export function checkmark(
  sel: Sel,
  opts: { x: number; y: number; size?: number; color?: string; width?: number },
): { path: Sel; reveal: (p: number) => void } {
  const s = opts.size ?? 18;
  const len = s * 0.95;
  const path = sel
    .append('path')
    .attr('d', `M${opts.x + s * 0.19} ${opts.y + s * 0.5} L${opts.x + s * 0.42} ${opts.y + s * 0.75} L${opts.x + s * 0.8} ${opts.y + s * 0.25}`)
    .attr('fill', 'none')
    .attr('stroke', opts.color ?? 'var(--color-success)')
    .attr('stroke-width', opts.width ?? 2.6)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-dasharray', len)
    .attr('stroke-dashoffset', len) as unknown as Sel;
  return { path, reveal: (p: number) => path.attr('stroke-dashoffset', len * (1 - Math.max(0, Math.min(1, p)))) };
}
