// 球機結構標註（正視）：球形防護框、四組馬達＋螺旋槳、中央飛控、電池，
// 並以引線帶出文章的三項安全重點（防護框材質、槳徑上限、Fail-safe 斷訊停馬達）。
import { scaffold, annotate, roundedBox, centerText, loop, type Sel, type Pt } from './_base';

export default function draw(mount: HTMLElement) {
  const { svg, reduce } = scaffold(mount, { W: 640, H: 320, title: '球機結構解剖（正視示意）' });

  const cx = 200, cy = 182, R = 95;

  // ── 球形防護框：外圈 + 經緯線構成測地線網籠感（限塑膠／複合材料，禁金屬） ──
  const cage = svg.append('g');
  cage.append('circle').attr('cx', cx).attr('cy', cy).attr('r', R)
    .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 2.2);
  // 經線（縱向橢圓，不同 rx）
  [32, 64].forEach((rx) => cage.append('ellipse').attr('cx', cx).attr('cy', cy).attr('rx', rx).attr('ry', R)
    .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1).attr('opacity', 0.6));
  // 緯線（橫向橢圓，不同 ry）
  [32, 64].forEach((ry) => cage.append('ellipse').attr('cx', cx).attr('cy', cy).attr('rx', R).attr('ry', ry)
    .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1).attr('opacity', 0.6));

  // ── 中央機身：上半為飛控、下半為電池 ──
  const bodyW = 56, bodyH = 62, bx = cx - bodyW / 2, by = cy - bodyH / 2, mid = cy - 1;
  roundedBox(svg, { x: bx, y: by, w: bodyW, h: bodyH, rx: 6 });
  // 飛控（上半）
  roundedBox(svg, { x: bx + 4, y: by + 4, w: bodyW - 8, h: bodyH / 2 - 6, rx: 3, fill: 'none', stroke: 'var(--color-tech)' });
  // Fail-safe 晶片（飛控上一顆綠色小方塊）
  svg.append('rect').attr('x', cx - 7).attr('y', by + 12).attr('width', 14).attr('height', 12).attr('rx', 2)
    .attr('fill', 'var(--color-success)').attr('opacity', 0.85);
  // 電池（下半）
  roundedBox(svg, { x: bx + 4, y: mid + 2, w: bodyW - 8, h: bodyH / 2 - 6, rx: 3, fill: 'none', stroke: 'var(--color-action)' });
  centerText(svg, { x: cx, y: mid + bodyH / 4 + 2, text: '4S', size: 10, weight: 700, fill: 'var(--color-action)' });

  // ── 四組馬達＋螺旋槳（X 型配置，最多 4 顆） ──
  const motors: Pt[] = [
    { x: cx - 54, y: cy - 48 }, { x: cx + 54, y: cy - 48 },
    { x: cx - 54, y: cy + 48 }, { x: cx + 54, y: cy + 48 },
  ];
  const props: Sel[] = [];
  motors.forEach((m) => {
    // 支臂
    svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', m.x).attr('y2', m.y)
      .attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 3).attr('stroke-linecap', 'round');
    // 馬達座
    svg.append('circle').attr('cx', m.x).attr('cy', m.y).attr('r', 6)
      .attr('fill', 'var(--color-surface-muted)').attr('stroke', 'var(--color-text)').attr('stroke-width', 1.5);
    // 螺旋槳（兩片葉，可旋轉）
    const blades = svg.append('g').attr('transform', `translate(${m.x} ${m.y}) rotate(${reduce ? 30 : 0})`);
    [0, 90].forEach((a) => blades.append('ellipse').attr('rx', 18).attr('ry', 4.5)
      .attr('transform', `rotate(${a})`).attr('fill', 'var(--color-tech)').attr('opacity', 0.55));
    props.push(blades);
  });

  // ── 引線 + 標籤 ──
  const LX = 348; // 標籤起始 x
  annotate(svg, {
    from: { x: LX, y: 74 }, to: { x: cx + R * Math.cos(-0.62), y: cy + R * Math.sin(-0.62) },
    title: '球形防護框', desc: '限塑膠或複合材料，禁用金屬', color: 'var(--color-text)',
  });
  annotate(svg, {
    from: { x: LX, y: 132 }, to: motors[1],
    title: '馬達＋螺旋槳 ×4', desc: '最多 4 顆，槳徑 ≤ 3 吋、禁金屬槳', color: 'var(--color-tech)',
  });
  annotate(svg, {
    from: { x: LX, y: 190 }, to: { x: cx + 12, y: by + 16 },
    title: '飛控', desc: '統籌動力與訊號的中央控制核心', color: 'var(--color-tech)',
  });
  annotate(svg, {
    from: { x: LX, y: 248 }, to: { x: cx + 7, y: by + 18 },
    title: 'Fail-safe 失效保護', desc: '斷訊或異常立即停馬達，防失控', color: 'var(--color-success)',
  });
  annotate(svg, {
    from: { x: LX, y: 300 }, to: { x: cx + 12, y: mid + 12 },
    title: '電池', desc: '最高 4S，滿電不超過 17V', color: 'var(--color-action)',
  });

  // ── 螺旋槳旋轉動畫（reduce 時保持靜態） ──
  const dir = [1, -1, -1, 1]; // 相鄰反向轉，符合四軸配置
  loop(reduce, 1080, (_t, elapsed) => {
    props.forEach((g, i) => {
      const a = (elapsed / 3) * dir[i] % 360;
      g.attr('transform', `translate(${motors[i].x} ${motors[i].y}) rotate(${a})`);
    });
  });
}
