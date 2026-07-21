// 無人機足球發展時間軸：2016 韓國起源 → 2018 早期擴散 → 2019 FAI 列為航空運動項目 → 全球推廣。
// 年份與事件皆取自本篇文章，播放頭由左掃到右依序點亮各里程碑。
import { scaffold, TEAM_A, TEAM_B, drone, centerText, loop, type Sel } from './_base';

type Node = { year: string; title: string; desc: string };

export default function draw(mount: HTMLElement) {
  const { d3, svg, W, reduce } = scaffold(mount, { W: 640, H: 320, title: '無人機足球發展時間軸（2016 → 至今）' });

  const nodes: Node[] = [
    { year: '2016', title: '韓國起源', desc: '全州市 CAMTIC 發起，推手 Lee Beom-su' },
    { year: '2018', title: '早期擴散', desc: '高陽市展會約 22 隊、300+ 人參與' },
    { year: '2019', title: '走向國際', desc: 'FAI 列為航空運動、代號 F9A' },
    { year: '至今', title: '全球推廣', desc: '已在全球約 20 個國家推廣' },
  ];

  const axisY = 150;
  const xL = 70;
  const xR = W - 60;
  const xs = nodes.map((_, i) => xL + (xR - xL) * (i / (nodes.length - 1)));

  // 時間軸主線（帶箭頭指向未來）
  svg.append('line')
    .attr('x1', xL - 24).attr('y1', axisY).attr('x2', xR + 28).attr('y2', axisY)
    .attr('stroke', 'var(--color-border)').attr('stroke-width', 2.5)
    .attr('marker-end', 'url(#fig-arrow)');

  // 各里程碑：底座圈 + 年份（上）+ 事件（下），交錯排版避免文字重疊
  const groups = nodes.map((d, i) => {
    const x = xs[i];
    const up = i % 2 === 0; // 偶數在上、奇數在下

    // 連接短線
    svg.append('line')
      .attr('x1', x).attr('y1', axisY)
      .attr('x2', x).attr('y2', up ? axisY - 34 : axisY + 34)
      .attr('stroke', 'var(--color-border)').attr('stroke-width', 1.5);

    // 底座節點（未點亮：空心）
    const dot = svg.append('circle')
      .attr('cx', x).attr('cy', axisY).attr('r', 7)
      .attr('fill', 'var(--color-surface)')
      .attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 2);

    // 高亮圈（點亮時顯現）
    const halo = svg.append('circle')
      .attr('cx', x).attr('cy', axisY).attr('r', 13)
      .attr('fill', 'none').attr('stroke', i === 2 ? TEAM_A : TEAM_B)
      .attr('stroke-width', 2).attr('opacity', 0);

    const yYear = up ? axisY - 46 : axisY + 54;
    const yTitle = up ? axisY - 62 : axisY + 70;
    const yDesc = up ? axisY - 88 : axisY + 88;

    const year = centerText(svg, { x, y: yYear, text: d.year, size: 15, weight: 800, fill: 'var(--color-text-muted)' });

    const title = centerText(svg, { x, y: yTitle, text: d.title, size: 12, weight: 700, fill: 'var(--color-text-muted)' });

    // 事件說明分兩行以免過寬
    const words = d.desc;
    const desc = svg.append('text')
      .attr('x', x).attr('y', yDesc).attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('fill', 'var(--color-text-muted)')
      .attr('opacity', 0.85);
    const wrapAt = Math.ceil(words.length / 2);
    desc.append('tspan').attr('x', x).text(words.slice(0, wrapAt));
    desc.append('tspan').attr('x', x).attr('dy', 13).text(words.slice(wrapAt));

    return { x, dot, halo, year, title, desc, up, lit: i === 2 ? TEAM_A : TEAM_B };
  });

  const lightUp = (g: (typeof groups)[number], on: boolean) => {
    g.dot.attr('fill', on ? g.lit : 'var(--color-surface)')
      .attr('stroke', on ? g.lit : 'var(--color-text-muted)');
    g.halo.attr('opacity', on ? 0.9 : 0);
    g.year.attr('fill', on ? 'var(--color-text)' : 'var(--color-text-muted)');
    g.title.attr('fill', on ? g.lit : 'var(--color-text-muted)');
    g.desc.attr('fill', on ? 'var(--color-text)' : 'var(--color-text-muted)')
      .attr('opacity', on ? 1 : 0.85);
  };

  if (reduce) {
    // 靜態分支：全部節點點亮
    groups.forEach((g) => lightUp(g, true));
    return;
  }

  // 播放頭：一顆球沿軸由左掃到右，經過即點亮該節點
  const head = drone(svg, { x: xL - 24, y: axisY, r: 8, stroke: 'var(--color-text)', strokeWidth: 1 });

  const T = 6500, hold = 1200; // 掃描 + 尾端停留
  loop(reduce, T + hold, (_t, elapsed) => {
    const cyc = elapsed % (T + hold);
    const scanning = cyc < T;
    const u = scanning ? d3.easeCubicInOut(cyc / T) : 1;
    const hx = xL - 24 + (xR + 28 - (xL - 24)) * u;
    head.attr('cx', hx).attr('opacity', scanning ? 1 : 0.4 + 0.6 * Math.cos(((cyc - T) / hold) * Math.PI));
    groups.forEach((g) => lightUp(g, hx >= g.x - 2));
  });
}

// 避免未使用型別警告
export type { Sel };
