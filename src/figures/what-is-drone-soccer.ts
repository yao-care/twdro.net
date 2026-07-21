// 「什麼是無人機足球」場地示意：前鋒穿越對方球門環得分後退回半場的 7 秒循環。
// 示範 _base 共用元件的用法（goalRing／drone／strikerHalo／bezPt／lerpPt／loop…）。
import {
  scaffold, TEAM_A, TEAM_B,
  goalRing, drone, strikerHalo, roundedBox, centerText,
  bezPt, lerpPt, loop, type Pt,
} from './_base';

export default function draw(mount: HTMLElement) {
  const { d3, svg, reduce } = scaffold(mount, { W: 640, H: 300, title: 'FAI F9A-B（20 公分級）場地・側視示意' });

  const cage = { x: 70, y: 72, w: 500, h: 170 };
  svg.append('rect').attr('x', cage.x).attr('y', cage.y).attr('width', cage.w).attr('height', cage.h)
    .attr('rx', 4).attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 2.5);
  svg.append('line').attr('x1', 320).attr('y1', cage.y).attr('x2', 320).attr('y2', cage.y + cage.h)
    .attr('stroke', 'var(--color-text-muted)').attr('stroke-dasharray', '6 6').attr('opacity', 0.7);
  centerText(svg, { x: 320, y: 88, text: '中線', size: 11, fill: 'var(--color-text-muted)' });
  centerText(svg, { x: 185, y: 234, text: 'A 隊半場', size: 12, fill: 'var(--color-text-muted)' });
  centerText(svg, { x: 455, y: 234, text: 'B 隊半場', size: 12, fill: 'var(--color-text-muted)' });

  const rightRing: Pt = { x: 545, y: 140 };
  goalRing(svg, { cx: 95, cy: 140 });
  const rRing = goalRing(svg, { cx: rightRing.x, cy: rightRing.y });
  [95, 545].forEach((cx) => centerText(svg, { x: cx, y: 120, text: '球門環', size: 11, fill: 'var(--color-tech)' }));

  [98, 542].forEach((cx) => {
    roundedBox(svg, { x: cx - 20, y: 226, w: 40, h: 14, rx: 2, fill: 'var(--color-surface)', strokeWidth: 1 });
    centerText(svg, { x: cx, y: 237, text: '起飛區', size: 9, fill: 'var(--color-text-muted)' });
  });

  centerText(svg, { x: 320, y: 262, text: '◄──────── 長 6 公尺 ────────►', size: 12, fill: 'var(--color-text-muted)' });
  svg.append('text').attr('x', 52).attr('y', 157).attr('text-anchor', 'middle').attr('font-size', 12)
    .attr('fill', 'var(--color-text-muted)').attr('transform', 'rotate(-90 52 157)').text('高 3 公尺');

  const mates = [
    { x: 150, y: 175, team: 'a' }, { x: 200, y: 128, team: 'a' },
    { x: 490, y: 175, team: 'b' }, { x: 440, y: 128, team: 'b' }, { x: 395, y: 160, team: 'b' },
  ];
  const mateSel = svg.selectAll('circle.mate').data(mates).enter().append('circle')
    .attr('class', 'mate').attr('r', 9).attr('cx', (d) => d.x).attr('cy', (d) => d.y)
    .attr('fill', (d) => d.team === 'a' ? TEAM_A : TEAM_B);

  const halo = strikerHalo(svg, { x: 0, y: 0 });
  const striker = drone(svg, { x: 0, y: 0, fill: TEAM_A });
  const strikerLabel = centerText(svg, { x: 0, y: 0, text: '前鋒', size: 11, weight: 700 });
  const scoreText = centerText(svg, { x: rightRing.x, y: rightRing.y - 42, text: '+1 得分', size: 18, weight: 800, fill: TEAM_B }).attr('opacity', 0);

  const start: Pt = { x: 200, y: 150 }, goal: Pt = { x: 532, y: 138 }, back: Pt = { x: 185, y: 158 }, ctrl: Pt = { x: 370, y: 92 };
  const place = (p: Pt) => { striker.attr('cx', p.x).attr('cy', p.y); halo.attr('cx', p.x).attr('cy', p.y); strikerLabel.attr('x', p.x).attr('y', p.y - 20); };

  if (reduce) {
    place(bezPt(start, ctrl, goal, 0.5));
    svg.append('path').attr('d', `M${start.x} ${start.y} Q${ctrl.x} ${ctrl.y} ${goal.x} ${goal.y}`)
      .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4').attr('marker-end', 'url(#fig-arrow)');
    centerText(svg, { x: 405, y: 108, text: '前鋒穿越對方球門環得分', size: 11, fill: 'var(--color-text-muted)' });
    return;
  }

  const ease = d3.easeCubicInOut;
  loop(reduce, 7000, (t, elapsed) => {
    mateSel.attr('cy', (d) => d.y + 4 * Math.sin(elapsed / 700 + d.x));
    let p: Pt, ringScale = 1, scoring = false;
    if (t < 0.45) { p = bezPt(start, ctrl, goal, ease(t / 0.45)); }
    else if (t < 0.58) { p = goal; ringScale = 1 + 0.28 * Math.sin((t - 0.45) / 0.13 * Math.PI); scoring = true; }
    else if (t < 0.8) { p = lerpPt(goal, back, ease((t - 0.58) / 0.22)); }
    else { p = back; }
    place(p);
    rRing.attr('transform', `translate(${rightRing.x} ${rightRing.y}) scale(1 ${ringScale}) translate(${-rightRing.x} ${-rightRing.y})`);
    scoreText.attr('opacity', scoring ? 0.5 + 0.5 * Math.sin((t - 0.45) / 0.13 * Math.PI) : 0);
  });
}
