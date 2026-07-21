// 「只有前鋒能得分」對比示意：同一隊的兩台球機都穿越對方球門環，
// 但只有被標記為前鋒者（虛線光環）計「+1 得分」，非前鋒穿門則「不得分」。
// 示範 _base 共用元件的用法（goalRing／drone／strikerHalo／roundedBox／centerText／bezPt／lerpPt／loop…）。
import {
  scaffold,
  goalRing, drone, strikerHalo, roundedBox, centerText,
  bezPt, lerpPt, loop, type Pt,
} from './_base';

export default function draw(mount: HTMLElement) {
  const { d3, svg, W, reduce } = scaffold(mount, { W: 640, H: 320, title: '為什麼只有前鋒（Striker）能得分？' });

  // 一個面板 = 一種情境：球機從己方飛越對方球門環，判定是否得分。
  interface Panel {
    ox: number;            // 面板左緣
    header: string;        // 頂端小標
    striker: boolean;      // 是否為前鋒（決定虛線光環與得分結果）
    ring: Pt;              // 球門環中心
    start: Pt; ctrl: Pt; goal: Pt; end: Pt;
  }

  const buildPanel = (p: Panel) => {
    const g = svg.append('g');

    // 面板底框
    roundedBox(g, { x: p.ox, y: 56, w: 264, h: 220, rx: 8, fill: 'none', strokeWidth: 1 })
      .attr('stroke-dasharray', '2 4').attr('opacity', 0.8);

    // 頂端情境標題
    centerText(g, { x: p.ox + 132, y: 74, text: p.header, size: 12.5, weight: 700 });

    // 對方球門環
    const ring = goalRing(g, { cx: p.ring.x, cy: p.ring.y });
    centerText(g, { x: p.ring.x, y: p.ring.y + 52, text: '對方球門環', size: 10.5, fill: 'var(--color-tech)' });

    // 起飛區
    roundedBox(g, { x: p.start.x - 22, y: p.ring.y + 40, w: 44, h: 14, rx: 2, strokeWidth: 1 });
    centerText(g, { x: p.start.x, y: p.ring.y + 50, text: '己方半場', size: 9, fill: 'var(--color-text-muted)' });

    // 前鋒的虛線光環（僅前鋒有）
    const halo = p.striker ? strikerHalo(g, { x: 0, y: 0 }) : null;
    // 球機本體
    const body = drone(g, { x: 0, y: 0, stroke: 'var(--color-surface)', strokeWidth: 1.5 });
    // 球機下方角色標籤
    const roleLabel = centerText(g, {
      x: 0, y: 0, text: p.striker ? '前鋒' : '非前鋒', size: 10.5,
      weight: p.striker ? 700 : 400, fill: p.striker ? 'var(--color-text)' : 'var(--color-text-muted)',
    });

    // 判定結果：得分（綠）／不得分（紅＋打叉）
    const ok = p.striker;
    const verdict = centerText(g, {
      x: p.ring.x, y: p.ring.y - 44, text: ok ? '+1 得分' : '不得分',
      size: 17, weight: 800, fill: ok ? 'var(--color-success)' : 'var(--color-danger)',
    }).attr('opacity', 0);
    // 非前鋒的紅色打叉（疊在球門環上）
    const crossG = g.append('g').attr('opacity', 0);
    if (!ok) {
      const cx = p.ring.x, cy = p.ring.y, d = 13;
      crossG.append('line').attr('x1', cx - d).attr('y1', cy - d).attr('x2', cx + d).attr('y2', cy + d)
        .attr('stroke', 'var(--color-danger)').attr('stroke-width', 3.5).attr('stroke-linecap', 'round');
      crossG.append('line').attr('x1', cx + d).attr('y1', cy - d).attr('x2', cx - d).attr('y2', cy + d)
        .attr('stroke', 'var(--color-danger)').attr('stroke-width', 3.5).attr('stroke-linecap', 'round');
    }

    const place = (q: Pt) => {
      body.attr('cx', q.x).attr('cy', q.y);
      halo?.attr('cx', q.x).attr('cy', q.y);
      roleLabel.attr('x', q.x).attr('y', q.y + 22);
    };

    return { g, ring, verdict, crossG, place, panel: p };
  };

  const panels: Panel[] = [
    { ox: 24, header: '被指定的前鋒穿門', striker: true,
      ring: { x: 232, y: 168 }, start: { x: 60, y: 190 }, ctrl: { x: 150, y: 118 }, goal: { x: 232, y: 168 }, end: { x: 274, y: 162 } },
    { ox: 352, header: '一般隊友穿門', striker: false,
      ring: { x: 560, y: 168 }, start: { x: 388, y: 190 }, ctrl: { x: 478, y: 118 }, goal: { x: 560, y: 168 }, end: { x: 602, y: 162 } },
  ];

  const built = panels.map(buildPanel);

  // 中央分隔線
  svg.append('line').attr('x1', 320).attr('y1', 60).attr('x2', 320).attr('y2', 272)
    .attr('stroke', 'var(--color-border)').attr('opacity', 0.7);

  // 底部規則註解（取自本篇：唯一得分角色 + 其他球機不計分也不受罰）
  centerText(svg, {
    x: W / 2, y: 300, size: 11, fill: 'var(--color-text-muted)',
    text: '全隊只有指定前鋒穿越對方球門環才算得分；其他球機就算飛過球門，既不計分也不受罰。',
  });

  if (reduce) {
    // 靜態並列：兩情境各停在穿門瞬間，畫出飛行路徑並亮出判定結果。
    built.forEach((b) => {
      const p = b.panel;
      b.g.insert('path', ':first-child')
        .attr('d', `M${p.start.x} ${p.start.y} Q${p.ctrl.x} ${p.ctrl.y} ${p.goal.x} ${p.goal.y}`)
        .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5 4').attr('marker-end', 'url(#fig-arrow)').attr('opacity', 0.8);
      b.place(p.goal);
      b.verdict.attr('opacity', 1);
      b.crossG.attr('opacity', 1);
    });
    return;
  }

  const ease = d3.easeCubicInOut;
  loop(reduce, 6000, (t) => {
    built.forEach((b) => {
      const p = b.panel;
      let q: Pt, ringScale = 1, crossing = false, done = false;
      if (t < 0.42) {                                   // 飛向對方球門環
        q = bezPt(p.start, p.ctrl, p.goal, ease(t / 0.42));
      } else if (t < 0.58) {                            // 穿門瞬間：判定
        q = p.goal; crossing = true;
        ringScale = 1 + 0.28 * Math.sin((t - 0.42) / 0.16 * Math.PI);
      } else if (t < 0.8) {                             // 穿出後退回
        q = lerpPt(p.goal, p.end, ease((t - 0.58) / 0.22)); done = true;
      } else {
        q = p.end; done = true;
      }
      b.place(q);
      b.ring.attr('transform', `translate(${p.ring.x} ${p.ring.y}) scale(1 ${ringScale}) translate(${-p.ring.x} ${-p.ring.y})`);
      const show = crossing || done ? 1 : 0;
      const pulse = crossing ? 0.5 + 0.5 * Math.sin((t - 0.42) / 0.16 * Math.PI) : (done ? 1 : 0);
      b.verdict.attr('opacity', crossing ? pulse : show);
      b.crossG.attr('opacity', crossing ? pulse : show);
    });
  });
}
