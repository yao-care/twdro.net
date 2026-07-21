// 「選購第一台球機」檢查關卡流程：一顆球由左往右，依序通過 5 個檢錄門檻，
// 每通過一關該節點打勾亮綠——全數通過才安心下手。關卡取自本篇選購重點。
import { scaffold, drone, centerText, loop, lerp, type Sel } from './_base';

type Gate = { x: number; t1: string; t2: string };

export default function draw(mount: HTMLElement) {
  const { d3, svg, W, reduce } = scaffold(mount, { W: 640, H: 320, title: '選購第一台球機的檢查關卡' });

  const NY = 150;
  const R = 22;
  const leftX = 44;
  const rightX = 596;

  const nodes: Gate[] = [
    { x: 70, t1: '對準賽事規格', t2: '20／40 公分級' },
    { x: 195, t1: '防護框合規', t2: '塑膠/複合・禁金屬' },
    { x: 320, t1: '螺旋槳合規', t2: '≤3 吋・禁金屬' },
    { x: 445, t1: 'fail-safe', t2: '斷訊即停馬達' },
    { x: 570, t1: '售後與預算', t2: '通路・問教練' },
  ];

  // 關卡之間的連線與箭頭（畫在節點底下）
  const xs = nodes.map((n) => n.x);
  const links: { x1: number; x2: number }[] = [{ x1: leftX, x2: xs[0] - R - 6 }];
  for (let i = 0; i < xs.length - 1; i++) links.push({ x1: xs[i] + R + 6, x2: xs[i + 1] - R - 6 });
  links.push({ x1: xs[xs.length - 1] + R + 6, x2: rightX });

  svg.selectAll('line.link').data(links).enter().append('line').attr('class', 'link')
    .attr('x1', (d) => d.x1).attr('y1', NY).attr('x2', (d) => d.x2).attr('y2', NY)
    .attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5).attr('opacity', 0.7)
    .attr('marker-end', 'url(#fig-arrow)');

  // 起點／終點標示
  centerText(svg, { x: leftX, y: NY - 30, text: '開始選購', size: 11, fill: 'var(--color-text-muted)' });
  const doneBanner = centerText(svg, { x: rightX, y: NY - 30, text: '✓ 通過檢錄', size: 13, weight: 800, fill: 'var(--color-success)' }).attr('opacity', 0);

  // 各關卡節點
  const nodeG = svg.selectAll('g.node').data(nodes).enter().append('g').attr('class', 'node')
    .attr('transform', (d) => `translate(${d.x},${NY})`);
  nodeG.append('circle').attr('class', 'ring').attr('r', R)
    .attr('fill', 'var(--color-surface)').attr('stroke', 'var(--color-tech)').attr('stroke-width', 2.5);
  nodeG.append('text').attr('class', 'num').attr('y', 5).attr('text-anchor', 'middle')
    .attr('font-size', 15).attr('font-weight', 800).attr('fill', 'var(--color-tech)').text((_, i) => String(i + 1));
  nodeG.append('path').attr('class', 'check').attr('d', 'M-8 0 L-2 7 L9 -8')
    .attr('fill', 'none').attr('stroke', 'var(--color-surface)').attr('stroke-width', 3.5)
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('opacity', 0);
  nodeG.append('text').attr('class', 't1').attr('y', R + 18).attr('text-anchor', 'middle')
    .attr('font-size', 11).attr('font-weight', 700).attr('fill', 'var(--color-text)').text((d) => d.t1);
  nodeG.append('text').attr('class', 't2').attr('y', R + 32).attr('text-anchor', 'middle')
    .attr('font-size', 10).attr('fill', 'var(--color-text-muted)').text((d) => d.t2);

  // 球
  const ball = drone(svg, { x: leftX, y: NY, r: 10, fill: 'var(--color-ball)', stroke: 'var(--color-surface)', strokeWidth: 2 });

  // 底部說明
  centerText(svg, { x: W / 2, y: 300, text: '每一關都是檢錄門檻——缺一項就可能無法上場，全數通過再下手最安心。', size: 11, fill: 'var(--color-text-muted)' });

  // 依已通過關卡數點亮節點
  const setLit = (k: number) => {
    nodeG.each(function (_, i) {
      const g = d3.select(this);
      const lit = i < k;
      g.select('.ring').attr('fill', lit ? 'var(--color-success)' : 'var(--color-surface)')
        .attr('stroke', lit ? 'var(--color-success)' : 'var(--color-tech)');
      g.select('.num').attr('opacity', lit ? 0 : 1);
      g.select('.check').attr('opacity', lit ? 1 : 0);
    });
  };

  if (reduce) {
    setLit(nodes.length);
    ball.attr('cx', rightX);
    doneBanner.attr('opacity', 1);
    return;
  }

  // 建立時間軸：移動到某關 → 停留點亮 → 下一關，最後衝向終點
  type Seg = { t0: number; t1: number; x0: number; x1: number; lit: number; done?: boolean };
  const segs: Seg[] = [];
  const move = 850, dwell = 550, ease = d3.easeCubicInOut;
  let t = 0, prev = leftX;
  nodes.forEach((n, i) => {
    segs.push({ t0: t, t1: t + move, x0: prev, x1: n.x, lit: i }); t += move;
    segs.push({ t0: t, t1: t + dwell, x0: n.x, x1: n.x, lit: i + 1 }); t += dwell;
    prev = n.x;
  });
  segs.push({ t0: t, t1: t + move, x0: prev, x1: rightX, lit: nodes.length }); t += move;
  segs.push({ t0: t, t1: t + 1100, x0: rightX, x1: rightX, lit: nodes.length, done: true }); t += 1100;
  const T = t;

  loop(reduce, T, (t, elapsed) => {
    const cur = t * T;
    const seg = segs.find((s) => cur >= s.t0 && cur < s.t1) ?? segs[segs.length - 1];
    const span = seg.t1 - seg.t0;
    const u = span > 0 ? ease(Math.min(1, (cur - seg.t0) / span)) : 1;
    const x = lerp(seg.x0, seg.x1, u);
    ball.attr('cx', x).attr('cy', NY + 3 * Math.sin(elapsed / 260));
    setLit(seg.lit);
    doneBanner.attr('opacity', seg.done ? 1 : 0);
  });
}

// 避免未使用型別警告
export type { Sel };
