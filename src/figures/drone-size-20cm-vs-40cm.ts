// 20 公分 vs 40 公分球機示意：依實際直徑比例畫兩顆圓，並列對照重量／螺旋槳／電池／適用對象。
// 示範 _base 共用元件的用法（drone／centerText／loop…）。
import { scaffold, TEAM_A, TEAM_B, drone, centerText, loop } from './_base';

type Ball = { cx: number; cy: number; r: number; color: string };

export default function draw(mount: HTMLElement) {
  const { svg, W, reduce } = scaffold(mount, { W: 640, H: 340, title: '20 公分 vs 40 公分球機・依實際直徑比例' });

  // 兩顆球機依真實直徑比例（20:40 = 1:2）。
  const small: Ball = { cx: 175, cy: 118, r: 31, color: TEAM_A };  // 20 公分（F9A-B）
  const large: Ball = { cx: 470, cy: 118, r: 62, color: TEAM_B };  // 40 公分（Class 40）

  const balls = [small, large];
  const sels = balls.map((b) =>
    drone(svg, { x: b.cx, y: b.cy, r: b.r, fill: 'var(--color-surface)', stroke: b.color, strokeWidth: 3 }),
  );

  // 直徑標線（雙箭頭橫貫圓心）＋標籤
  const dim = (b: Ball, label: string) => {
    svg.append('line')
      .attr('x1', b.cx - b.r).attr('y1', b.cy).attr('x2', b.cx + b.r).attr('y2', b.cy)
      .attr('stroke', b.color).attr('stroke-width', 1.5)
      .attr('marker-start', 'url(#fig-arrow)').attr('marker-end', 'url(#fig-arrow)');
    centerText(svg, { x: b.cx, y: b.cy + b.r + 22, text: label, size: 13, weight: 700, fill: b.color });
  };
  dim(small, '直徑 20 公分');
  dim(large, '直徑 40 公分');

  // ── 規格對照表 ──
  const labelX = 26;      // 列名（靠左）
  const col20 = 300;      // 20 公分欄（置中）
  const col40 = 500;      // 40 公分欄（置中）
  const headY = 216;
  const rowH = 27;
  const row0 = headY + 24;

  // 欄標題
  centerText(svg, { x: col20, y: headY, text: '20 公分（F9A-B）', size: 12, weight: 800, fill: TEAM_A });
  centerText(svg, { x: col40, y: headY, text: '40 公分（Class 40）', size: 12, weight: 800, fill: TEAM_B });

  // 表頭底線
  svg.append('line').attr('x1', labelX).attr('y1', headY + 8).attr('x2', W - 26).attr('y2', headY + 8)
    .attr('stroke', 'var(--color-border)');

  const rows: Array<{ k: string; a: string; b: string }> = [
    { k: '重量上限', a: '≤ 300 公克', b: '≤ 1,100 公克' },
    { k: '螺旋槳', a: '最大 3 吋', b: '依賽事簡章' },
    { k: '電池', a: '最高 4S', b: '依賽事簡章' },
    { k: '適用對象', a: '初學者・教育推廣', b: '成人・進階選手' },
  ];

  rows.forEach((r, i) => {
    const y = row0 + i * rowH;
    if (i > 0) {
      svg.append('line').attr('x1', labelX).attr('y1', y - rowH + 8).attr('x2', W - 26).attr('y2', y - rowH + 8)
        .attr('stroke', 'var(--color-border)').attr('opacity', 0.4);
    }
    centerText(svg, { x: labelX, y, text: r.k, size: 12, fill: 'var(--color-text-muted)', anchor: 'start' });
    centerText(svg, { x: col20, y, text: r.a, size: 12, weight: 600 });
    centerText(svg, { x: col40, y, text: r.b, size: 12, weight: 600 });
  });

  // 輕微脈動（reduce 時 loop 自動不啟動，保持靜態）。
  loop(reduce, 1200, (_t, elapsed) => {
    sels.forEach((s, i) =>
      s.attr('r', balls[i].r * (1 + 0.03 * Math.sin(elapsed / 600 + balls[i].cx))),
    );
  });
}
