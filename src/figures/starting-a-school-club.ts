// 「在學校成立無人機足球社團」四步流程：一顆球沿路徑前進，逐步點亮各步驟。
import { scaffold, lerp, drone, roundedBox, centerText, loop, type Sel } from './_base';

type Node = { cx: number; num: string; l1: string; l2: string };

export default function draw(mount: HTMLElement) {
  const { d3, svg, W, reduce } = scaffold(mount, { W: 640, H: 300, title: '成立學校社團的四個步驟' });

  const nodes: Node[] = [
    { cx: 90, num: '1', l1: '找到', l2: '指導資源' },
    { cx: 235, num: '2', l1: '安全教育', l2: '先行' },
    { cx: 380, num: '3', l1: '器材', l2: '循序擴充' },
    { cx: 525, num: '4', l1: '交流', l2: '累積經驗' },
  ];

  const boxW = 112, boxH = 72, boxY = 116, boxCy = boxY + boxH / 2; // 中心 152
  const pathY = 136; // 球與徽章所在高度

  // 步驟之間的箭頭（永遠靜態畫出）
  for (let i = 0; i < nodes.length - 1; i++) {
    const x1 = nodes[i].cx + boxW / 2 + 3;
    const x2 = nodes[i + 1].cx - boxW / 2 - 3;
    svg.append('line')
      .attr('x1', x1).attr('y1', boxCy).attr('x2', x2).attr('y2', boxCy)
      .attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#fig-arrow)');
  }

  // 各步驟節點
  type NodeSel = { rect: Sel; badge: Sel; badgeText: Sel; l1: Sel; l2: Sel };
  const sels: NodeSel[] = nodes.map((n) => {
    const g = svg.append('g');
    const rect = roundedBox(g, {
      x: n.cx - boxW / 2, y: boxY, w: boxW, h: boxH, rx: 10,
      fill: 'var(--color-surface-muted)', stroke: 'var(--color-border)', strokeWidth: 1.5,
    });
    const badge = g.append('circle')
      .attr('cx', n.cx).attr('cy', pathY).attr('r', 13)
      .attr('fill', 'var(--color-text-muted)');
    const badgeText = centerText(g, {
      x: n.cx, y: pathY + 4, text: n.num, size: 13, weight: 800, fill: 'var(--color-surface)',
    });
    const l1 = centerText(g, {
      x: n.cx, y: 168, text: n.l1, size: 12.5, weight: 700, fill: 'var(--color-text-muted)',
    });
    const l2 = centerText(g, {
      x: n.cx, y: 184, text: n.l2, size: 12.5, weight: 700, fill: 'var(--color-text-muted)',
    });
    return { rect, badge, badgeText, l1, l2 };
  });

  const setLit = (i: number, lit: boolean) => {
    const s = sels[i];
    s.rect.attr('fill', lit ? 'var(--color-surface)' : 'var(--color-surface-muted)')
      .attr('stroke', lit ? 'var(--color-action)' : 'var(--color-border)')
      .attr('stroke-width', lit ? 2.5 : 1.5);
    s.badge.attr('fill', lit ? 'var(--color-action)' : 'var(--color-text-muted)');
    s.l1.attr('fill', lit ? 'var(--color-text)' : 'var(--color-text-muted)');
    s.l2.attr('fill', lit ? 'var(--color-text)' : 'var(--color-text-muted)');
  };

  // 底部說明
  centerText(svg, {
    x: W / 2, y: 226, size: 11.5, fill: 'var(--color-text-muted)',
    text: '依學校資源與目標賽事簡章調整節奏，安全教育務必擺在技能訓練之前',
  });

  const cxs = nodes.map((n) => n.cx);

  if (reduce) {
    // 靜態：全部點亮，球停在最後一步
    nodes.forEach((_, i) => setLit(i, true));
    drone(svg, { x: cxs[cxs.length - 1], y: pathY, fill: 'var(--color-ball)', stroke: 'var(--color-text)', strokeWidth: 1 });
    return;
  }

  // 動畫：球沿路徑前進，逐步點亮
  const ball = drone(svg, { x: 0, y: 0, fill: 'var(--color-ball)', stroke: 'var(--color-text)', strokeWidth: 1 });
  const glow = svg.append('circle').attr('r', 15).attr('fill', 'none')
    .attr('stroke', 'var(--color-ball)').attr('stroke-width', 1.5).attr('opacity', 0.5);

  const T = 6800, travel = 0.86, segs = nodes.length - 1;
  const ease = d3.easeCubicInOut;
  loop(reduce, T, (t) => {
    const u = ease(Math.min(t / travel, 1)); // 0..1
    const index = u * segs; // 0..3
    const seg = Math.min(Math.floor(index), segs - 1);
    const frac = index - seg;
    const x = lerp(cxs[seg], cxs[seg + 1], frac);
    ball.attr('cx', x).attr('cy', pathY);
    glow.attr('cx', x).attr('cy', pathY);

    const litCount = Math.min(Math.floor(index) + 1, nodes.length);
    nodes.forEach((_, i) => setLit(i, i < litCount));
  });
}

export type { Sel };
