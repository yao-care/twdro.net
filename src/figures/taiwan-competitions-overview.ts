// 臺灣無人機足球賽事分類樹：中心節點向下分出「教育體系競賽」與「民間主辦賽事」
// 兩大分支，各自掛上文章所述的具體賽事／團隊類型。動畫：兩分支依序展開。
import { scaffold, TEAM_A, TEAM_B, roundedBox, centerText, type Sel } from './_base';

type Node = { x: number; y: number; label: string[]; w: number; h: number };

export default function draw(mount: HTMLElement) {
  const { svg, reduce } = scaffold(mount, { W: 640, H: 320, title: '臺灣無人機足球賽事分類' });

  // 節點定義（座標為中心點）。名稱皆取自文章，未捏造賽事。
  const root: Node = { x: 320, y: 64, label: ['臺灣無人機足球賽事'], w: 200, h: 34 };
  const edu: Node = { x: 172, y: 150, label: ['教育體系相關競賽'], w: 150, h: 32 };
  const civ: Node = { x: 468, y: 150, label: ['民間組織主辦的賽事'], w: 158, h: 32 };
  const eduL1: Node = { x: 96, y: 254, label: ['教育部推廣', '（科技教育競賽）'], w: 130, h: 42 };
  const eduL2: Node = { x: 248, y: 254, label: ['學校社團', '與學生團隊'], w: 130, h: 42 };
  const civL1: Node = { x: 392, y: 254, label: ['天穹盃', '（精簡隊伍編制）'], w: 130, h: 42 };
  const civL2: Node = { x: 544, y: 254, label: ['台灣無人機', '競技發展協會'], w: 130, h: 42 };

  // 邊：[父, 子, 分支色]
  const edges: [Node, Node, string][] = [
    [root, edu, TEAM_A], [root, civ, TEAM_B],
    [edu, eduL1, TEAM_A], [edu, eduL2, TEAM_A],
    [civ, civL1, TEAM_B], [civ, civL2, TEAM_B],
  ];

  // 先畫邊（在節點底下），保留 handle 以便逐條動畫
  const edgeSel = edges.map(([p, c, color]) => {
    const x1 = p.x, y1 = p.y + p.h / 2;
    const x2 = c.x, y2 = c.y - c.h / 2 - 4; // 留 marker 空間
    const len = Math.hypot(x2 - x1, y2 - y1);
    const line = svg.append('line')
      .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
      .attr('stroke', color).attr('stroke-width', 2).attr('opacity', 0.65)
      .attr('marker-end', 'url(#fig-arrow)');
    return { line, len };
  });

  // 畫節點盒子（方框→roundedBox、文字→centerText；外層 g 保留供整組淡入動畫）
  function box(n: Node, opts: { fill: string; stroke: string; sw: number; weight: number; fs: number; tcolor: string }): Sel {
    const g = svg.append('g').attr('transform', `translate(${n.x},${n.y})`) as unknown as Sel;
    roundedBox(g, { x: -n.w / 2, y: -n.h / 2, w: n.w, h: n.h, rx: 8, fill: opts.fill, stroke: opts.stroke, strokeWidth: opts.sw });
    const n0 = n.label.length;
    n.label.forEach((t, i) => {
      centerText(g, { x: 0, y: (i - (n0 - 1) / 2) * (opts.fs + 3) + opts.fs / 2 - 2, text: t, size: opts.fs, weight: opts.weight, fill: opts.tcolor });
    });
    return g;
  }

  const rootSel = box(root, { fill: 'var(--color-surface)', stroke: 'var(--color-text)', sw: 2, weight: 800, fs: 14, tcolor: 'var(--color-text)' });
  const eduSel = box(edu, { fill: 'var(--color-surface)', stroke: TEAM_A, sw: 2.5, weight: 700, fs: 13, tcolor: 'var(--color-text)' });
  const civSel = box(civ, { fill: 'var(--color-surface)', stroke: TEAM_B, sw: 2.5, weight: 700, fs: 13, tcolor: 'var(--color-text)' });
  const eduL1Sel = box(eduL1, { fill: 'var(--color-surface-muted)', stroke: TEAM_A, sw: 1.5, weight: 500, fs: 12, tcolor: 'var(--color-text-muted)' });
  const eduL2Sel = box(eduL2, { fill: 'var(--color-surface-muted)', stroke: TEAM_A, sw: 1.5, weight: 500, fs: 12, tcolor: 'var(--color-text-muted)' });
  const civL1Sel = box(civL1, { fill: 'var(--color-surface-muted)', stroke: TEAM_B, sw: 1.5, weight: 500, fs: 12, tcolor: 'var(--color-text-muted)' });
  const civL2Sel = box(civL2, { fill: 'var(--color-surface-muted)', stroke: TEAM_B, sw: 1.5, weight: 500, fs: 12, tcolor: 'var(--color-text-muted)' });

  // 動畫排程：edges index 對應 edgeSel；node 依序淡入
  // 0 root→edu, 1 root→civ, 2 edu→L1, 3 edu→L2, 4 civ→L1, 5 civ→L2
  const eduBranch = { edges: [0, 2, 3], nodes: [eduSel, eduL1Sel, eduL2Sel] };
  const civBranch = { edges: [1, 4, 5], nodes: [civSel, civL1Sel, civL2Sel] };

  if (reduce) {
    // 靜態：全部展開，直接呈現最終狀態
    return;
  }

  // 動態：root 先出，接著教育分支逐項展開，再民間分支
  rootSel.attr('opacity', 0).transition().duration(400).attr('opacity', 1);

  [eduBranch, civBranch].forEach((branch, bi) => {
    const base = 500 + bi * 1100;
    branch.edges.forEach((ei, k) => {
      const { line, len } = edgeSel[ei];
      line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len).attr('opacity', 0.65)
        .transition().delay(base + k * 300).duration(450)
        .attr('stroke-dashoffset', 0);
    });
    branch.nodes.forEach((sel, k) => {
      sel.attr('opacity', 0)
        .transition().delay(base + k * 300 + 200).duration(350)
        .attr('opacity', 1);
    });
  });
}

// 避免未使用型別警告
export type { Sel };
