// 一學期課程「由淺入深」進度階梯：四個教學階段沿階梯往上爬，一顆球逐階前進。
// 階段與名稱取自文章（第一～第四階段）；文章未定週次（時數依年齡/器材調整），故不標具體週次。
// 示範 _base 共用元件的用法（drone／centerText／loop／Pt）。
import { scaffold, drone, centerText, loop, type Pt } from './_base';

export default function draw(mount: HTMLElement) {
  const { d3, svg, reduce } = scaffold(mount, { W: 640, H: 300, title: '一學期課程・由淺入深的進度階梯' });

  // 四個教學階段（名稱取自文章），依上升順序排列
  const stages = [
    { n: '一', name: '認識運動與安全', node: { x: 128, y: 240 } },
    { n: '二', name: '基礎飛行操控', node: { x: 268, y: 190 } },
    { n: '三', name: '團隊戰術與分工', node: { x: 408, y: 140 } },
    { n: '四', name: '模擬對抗與參賽', node: { x: 548, y: 90 } },
  ];

  // 階梯折線：踏面（水平）＋豎板（垂直），一路往右上爬
  const pathD = 'M60 240 H198 V190 H338 V140 H478 V90 H610';
  const stair = svg.append('path')
    .attr('d', pathD)
    .attr('fill', 'none')
    .attr('stroke', 'var(--color-text-muted)')
    .attr('stroke-width', 2.5)
    .attr('stroke-linejoin', 'round')
    .attr('marker-end', 'url(#fig-arrow)');
  const len = (stair.node() as SVGPathElement).getTotalLength();
  const pointAt = (u: number): Pt => {
    const pt = (stair.node() as SVGPathElement).getPointAtLength(u * len);
    return { x: pt.x, y: pt.y };
  };

  // 深度軸提示：淺 → 深
  centerText(svg, { x: 60, y: 268, text: '淺（基礎）', size: 12, anchor: 'start', fill: 'var(--color-text-muted)' });
  centerText(svg, { x: 610, y: 74, text: '深（進階）', size: 12, weight: 700, anchor: 'end', fill: 'var(--color-text-muted)' });

  // 各階段節點與標籤
  const nodeSel = svg.selectAll('circle.stage').data(stages).enter().append('circle')
    .attr('class', 'stage')
    .attr('cx', (d) => d.node.x).attr('cy', (d) => d.node.y).attr('r', 14)
    .attr('fill', 'var(--color-surface)')
    .attr('stroke', 'var(--color-tech)').attr('stroke-width', 2.5);
  svg.selectAll('text.stage-n').data(stages).enter().append('text')
    .attr('class', 'stage-n')
    .attr('x', (d) => d.node.x).attr('y', (d) => d.node.y + 5).attr('text-anchor', 'middle')
    .attr('font-size', 14).attr('font-weight', 800).attr('fill', 'var(--color-tech)')
    .text((d) => d.n);
  svg.selectAll('text.stage-name').data(stages).enter().append('text')
    .attr('class', 'stage-name')
    .attr('x', (d) => d.node.x).attr('y', (d) => d.node.y - 24).attr('text-anchor', 'middle')
    .attr('font-size', 12).attr('font-weight', 700).attr('fill', 'var(--color-text)')
    .text((d) => `第${d.n}階段`);
  svg.selectAll('text.stage-sub').data(stages).enter().append('text')
    .attr('class', 'stage-sub')
    .attr('x', (d) => d.node.x).attr('y', (d) => d.node.y - 10).attr('text-anchor', 'middle')
    .attr('font-size', 11).attr('fill', 'var(--color-text-muted)')
    .text((d) => d.name);

  // 逐階前進的球
  const ball = drone(svg, { x: 0, y: 0, r: 8, stroke: 'var(--color-surface)', strokeWidth: 1.5 });

  const highlight = (active: number) => {
    nodeSel.attr('stroke', (_d, i) => i === active ? 'var(--color-action)' : 'var(--color-tech)')
      .attr('stroke-width', (_d, i) => i === active ? 4 : 2.5);
  };
  // 依球位置找出最近的階段節點
  const nearest = (p: Pt): number => {
    let best = 0, bd = Infinity;
    stages.forEach((s, i) => {
      const dx = s.node.x - p.x, dy = s.node.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  if (reduce) {
    const p = pointAt(1);
    ball.attr('cx', p.x).attr('cy', p.y);
    highlight(stages.length - 1);
    return;
  }

  const ease = d3.easeCubicInOut;
  loop(reduce, 8000, (t) => {
    const u = t < 0.84 ? ease(t / 0.84) : 1;      // 爬升階段，末段停在頂端
    const p = pointAt(u);
    // 迴圈邊界淡入淡出，避免瞬移突兀
    const op = t < 0.05 ? t / 0.05 : t > 0.97 ? (1 - t) / 0.03 : 1;
    ball.attr('cx', p.x).attr('cy', p.y).attr('opacity', op);
    highlight(nearest(p));
  });
}
