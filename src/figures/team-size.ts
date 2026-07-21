// 「一隊有幾個人」場上分工站位圖：半場俯視，示意一隊 5 台球機的站位與角色。
// 人數與角色取自 team-size.md：FAI F9A-B 每隊場上 3–5 人；FIDA Class 40 上場 5 人，
// 分引導手／前鋒／自由人／清道夫／守門員五固定位置；唯前鋒穿越對方球門環才得分。
// 球門環／球機／前鋒光環／角色標籤／浮動動畫皆走 _base 共用元件。
import { scaffold, TEAM_A, goalRing, drone, strikerHalo, centerText, loop } from './_base';

type Drone = { x: number; y: number; role: string; striker?: boolean };

export default function draw(mount: HTMLElement) {
  const { svg, W, reduce } = scaffold(mount, {
    W: 640,
    H: 320,
    title: '場上分工站位（半場俯視・以 FIDA Class 40 五位置示意）',
  });

  // 己方半場（俯視），右緣即中線
  const field = { x: 56, y: 60, w: 414, h: 200 };
  const mid = field.x + field.w; // 中線 x=470
  const cy = field.y + field.h / 2; // 160

  svg.append('rect').attr('x', field.x).attr('y', field.y).attr('width', field.w).attr('height', field.h)
    .attr('rx', 4).attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 2.5);
  centerText(svg, { x: field.x + 8, y: field.y + field.h - 8, text: '己方半場', size: 12, fill: 'var(--color-text-muted)', anchor: 'start' });

  // 己方球門環（左緣，俯視為短垂直橢圓）
  goalRing(svg, { cx: field.x + 3, cy, rx: 5, ry: 26, width: 5 });
  centerText(svg, { x: field.x + 8, y: field.y - 7, text: '己方球門環', size: 11, fill: 'var(--color-tech)', anchor: 'start' });

  // 中線
  svg.append('line').attr('x1', mid).attr('y1', field.y).attr('x2', mid).attr('y2', field.y + field.h)
    .attr('stroke', 'var(--color-text-muted)').attr('stroke-dasharray', '6 6').attr('opacity', 0.7);
  centerText(svg, { x: mid, y: field.y - 7, text: '中線', size: 11, fill: 'var(--color-text-muted)' });

  // 對方球門環（中線外，示意得分目標方向）
  const oppRingX = 578;
  goalRing(svg, { cx: oppRingX, cy, rx: 5, ry: 26, width: 5 }).attr('opacity', 0.55);
  centerText(svg, { x: oppRingX, y: field.y - 7, text: '對方球門環', size: 11, fill: 'var(--color-tech)' }).attr('opacity', 0.7);

  // 得分路線：唯前鋒可穿越對方球門環得分（曲線箭頭，維持原樣不走 annotate）
  svg.append('path').attr('d', `M420 150 Q510 130 ${oppRingX - 8} ${cy}`)
    .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '5 4').attr('marker-end', 'url(#fig-arrow)').attr('opacity', 0.85);
  centerText(svg, { x: 512, y: 118, text: '唯前鋒可得分', size: 11, fill: 'var(--color-success)', weight: 700 });

  // 一隊 5 台球機的站位與角色（TEAM_A）
  const drones: Drone[] = [
    { x: 100, y: 165, role: '守門員' },
    { x: 172, y: 165, role: '清道夫' },
    { x: 252, y: 112, role: '自由人' },
    { x: 332, y: 206, role: '引導手' },
    { x: 415, y: 150, role: '前鋒', striker: true },
  ];

  // 逐台建立：前鋒先畫虛線護圈，再畫本體與角色標籤（保留原繪製順序＝標籤疊在本體上）
  const nodes = drones.map((d) => ({
    d,
    halo: d.striker ? strikerHalo(svg, { x: d.x, y: d.y, r: 17 }) : null,
    body: drone(svg, { x: d.x, y: d.y, r: 11, fill: TEAM_A }),
    label: centerText(svg, { x: d.x, y: d.y + 26, text: d.role, size: 11, weight: d.striker ? 700 : 600 }),
  }));

  const place = (offset: (d: Drone, i: number) => number) => {
    nodes.forEach(({ d, halo, body, label }, i) => {
      const y = d.y + offset(d, i);
      body.attr('cy', y);
      halo?.attr('cy', y);
      label.attr('y', y + 26);
    });
  };
  place(() => 0);

  // 人數規範註記（取自文章）
  centerText(svg, { x: W / 2, y: 288, text: 'FAI F9A-B：每隊場上 3–5 人　·　FIDA Class 40：上場 5 人，五固定位置（本圖示意）', size: 11, fill: 'var(--color-text-muted)' });
  centerText(svg, { x: W / 2, y: 306, text: '每人各操控一台球機；其餘隊員負責掩護、防守與干擾，護住前鋒路線', size: 11, fill: 'var(--color-text-muted)' });

  // 球機輕微浮動（reduce 時 loop 不啟動，維持 place(()=>0) 的靜態站位）
  loop(reduce, 5000, (_t, elapsed) => {
    place((_d, i) => 4 * Math.sin(elapsed / 720 + i * 1.3));
  });
}
