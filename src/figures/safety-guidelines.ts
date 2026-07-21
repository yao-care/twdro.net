// 安全規範示意：由內到外的層層防護（同心圈），像防護波紋依序亮起。
// 各層取自 safety-guidelines.md：球機 fail-safe → 防護框 → 場地圍網 → 檢錄規範。
import { scaffold, centerText, loop, type Sel } from './_base';

type Layer = { n: number; r: number; color: string; name: string; desc: string };

export default function draw(mount: HTMLElement) {
  const { svg, reduce } = scaffold(mount, {
    W: 640,
    H: 330,
    title: '層層防護：由內到外把風險逐層擋下',
  });

  const cx = 175;
  const cy = 185;

  // 由內到外四層防護（全部取自文章，未捏造）
  const layers: Layer[] = [
    { n: 1, r: 34, color: 'var(--color-tech)', name: '斷訊即停馬達（fail-safe）', desc: '球機一失去訊號就自動停槳，不會失控亂飛' },
    { n: 2, r: 66, color: 'var(--color-action)', name: '防護框吸收碰撞', desc: '塑膠／複合材料外框、禁金屬，槳最大 3 吋' },
    { n: 3, r: 98, color: 'var(--color-ball)', name: '場地圍網與邊界', desc: '把飛行範圍與觀眾、工作人員隔開' },
    { n: 4, r: 130, color: 'var(--color-success)', name: '賽前檢錄與規範', desc: '逐台檢查安全裝置，不合規不得上場' },
  ];
  const outerR = layers[layers.length - 1].r;

  // 波紋（動畫時由內往外擴散的一圈）
  const ripple = svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('fill', 'none')
    .attr('stroke', 'var(--color-success)')
    .attr('stroke-width', 2)
    .attr('r', 0)
    .attr('opacity', 0);

  // 同心防護環
  const rings = layers.map((L) =>
    svg
      .append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', L.r)
      .attr('fill', 'none')
      .attr('stroke', L.color)
      .attr('stroke-width', 3)
      .attr('opacity', 0.9),
  );

  // 圓心：受保護的選手／球機
  svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', 15)
    .attr('fill', 'var(--color-surface)')
    .attr('stroke', 'var(--color-text-muted)')
    .attr('stroke-width', 1.5);
  centerText(svg, { x: cx, y: cy + 4, text: '選手', size: 10 });

  // 各環頂端的編號徽章（垂直排開，一目了然對應右側說明）
  const badges = layers.map((L) => {
    const g = svg.append('g');
    g.append('circle')
      .attr('cx', cx)
      .attr('cy', cy - L.r)
      .attr('r', 9)
      .attr('fill', L.color);
    centerText(g, { x: cx, y: cy - L.r + 3.5, text: String(L.n), size: 10, weight: 700, fill: 'var(--color-surface)' });
    return g;
  });

  // 右側說明清單
  const legendX = 348;
  const legendY0 = 78;
  const rowH = 58;
  layers.forEach((L, i) => {
    const y = legendY0 + i * rowH;
    svg.append('circle')
      .attr('cx', legendX + 8)
      .attr('cy', y - 4)
      .attr('r', 8)
      .attr('fill', L.color);
    centerText(svg, { x: legendX + 8, y: y - 0.5, text: String(L.n), size: 10, weight: 700, fill: 'var(--color-surface)' });
    centerText(svg, { x: legendX + 26, y: y - 1, text: L.name, size: 12.5, weight: 700, anchor: 'start' });
    centerText(svg, { x: legendX + 26, y: y + 15, text: L.desc, size: 11, fill: 'var(--color-text-muted)', anchor: 'start' });
  });

  if (reduce) {
    // 靜態分支：所有防護層全亮
    rings.forEach((r) => r.attr('stroke-width', 3.5).attr('opacity', 1));
    return;
  }

  // 動畫：波紋由內往外擴散，經過哪一環就讓那一環亮起
  const T = 4200;
  loop(reduce, T, (t) => {
    const rr = t * (outerR + 24);
    ripple.attr('r', rr).attr('opacity', (1 - t) * 0.55);
    layers.forEach((L, i) => {
      const near = Math.max(0, 1 - Math.abs(rr - L.r) / 30);
      rings[i].attr('stroke-width', 3 + 4 * near).attr('opacity', 0.6 + 0.4 * near);
      badges[i].attr('transform', near > 0.01 ? `translate(${cx} ${cy - L.r}) scale(${1 + 0.25 * near}) translate(${-cx} ${-(cy - L.r)})` : null);
    });
  });
}

// 避免未使用型別警告
export type { Sel };
