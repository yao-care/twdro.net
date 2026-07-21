// FAI 與 FIDA 兩套規則體系的關鍵差異對照：左藍卡 FAI、右橘卡 FIDA，
// 逐列比對分類代號、上場人數、位置編制與體系緣起，底部標出共通點（只有前鋒能得分）。
import { scaffold, TEAM_A, TEAM_B, roundedBox, centerText, loop, type Sel } from './_base';

type Row = { label: string; fai: string; fida: string };

export default function draw(mount: HTMLElement) {
  const { svg, W, reduce } = scaffold(mount, { W: 640, H: 360, title: 'FAI vs FIDA：兩套規則體系關鍵差異' });

  const rows: Row[] = [
    { label: '分類代號', fai: 'F9A（40／20 cm 級）', fida: 'Class 40' },
    { label: '上場人數', fai: '每隊 3–5 名', fida: '固定 5 名' },
    { label: '位置編制', fai: '指定 1 名前鋒', fida: '五個固定位置' },
    { label: '體系緣起', fai: '2019 起 FAI 列項', fida: '獨立另一套' },
  ];

  const cardW = 200;
  const leftX = 24;
  const rightX = W - 24 - cardW; // 416
  const midX = 320;
  const cardTop = 46;
  const cardBottom = 260;
  const rowsTop = 88;
  const rowH = 42;
  const rowY = (i: number) => rowsTop + rowH * i + rowH / 2;

  // 兩張卡片群組（供淡入用）
  const gFai = svg.append('g');
  const gFida = svg.append('g');

  const buildCard = (g: Sel, x: number, name: string, color: string, valueOf: (r: Row) => string) => {
    // 卡片底
    roundedBox(g, { x, y: cardTop, w: cardW, h: cardBottom - cardTop, rx: 10, strokeWidth: 1 });
    // 標題底色帶（半透明隊伍色）：上緣圓角＋下緣補一段方角
    roundedBox(g, { x, y: cardTop, w: cardW, h: 36, rx: 10, fill: color, stroke: 'none' }).attr('opacity', 0.14);
    roundedBox(g, { x, y: cardTop + 20, w: cardW, h: 16, rx: 0, fill: color, stroke: 'none' }).attr('opacity', 0.14);
    // 卡片標題
    centerText(g, { x: x + cardW / 2, y: cardTop + 24, text: name, size: 16, weight: 800, fill: color });
    // 各列數值
    rows.forEach((r, i) => {
      centerText(g, { x: x + cardW / 2, y: rowY(i) + 4, text: valueOf(r), size: 12 });
    });
  };

  buildCard(gFai, leftX, 'FAI', TEAM_A, (r) => r.fai);
  buildCard(gFida, rightX, 'FIDA', TEAM_B, (r) => r.fida);

  // 中央：項目名稱 + 列分隔線
  rows.forEach((r, i) => {
    centerText(svg, { x: midX, y: rowY(i) + 4, text: r.label, size: 11.5, weight: 600, fill: 'var(--color-text-muted)' });
    if (i > 0) {
      [ [leftX, leftX + cardW], [rightX, rightX + cardW] ].forEach(([x1, x2]) => {
        svg.append('line').attr('x1', x1 + 12).attr('y1', rowsTop + rowH * i).attr('x2', x2 - 12).attr('y2', rowsTop + rowH * i)
          .attr('stroke', 'var(--color-border)').attr('opacity', 0.7);
      });
    }
  });

  // 逐列高亮（動畫時輪播；reduce 時不出現）
  const hl = roundedBox(svg, { x: leftX, y: 0, w: W - 2 * leftX, h: rowH - 6, rx: 6, fill: 'var(--color-text-muted)', stroke: 'none' })
    .attr('opacity', 0).attr('pointer-events', 'none');

  // 底部共通點
  const banded = svg.append('g');
  const bandY = 274, bandH = 62;
  roundedBox(banded, { x: leftX, y: bandY, w: W - 2 * leftX, h: bandH, rx: 10, fill: 'var(--color-success)', stroke: 'var(--color-success)', strokeWidth: 1 }).attr('opacity', 0.12);
  centerText(banded, { x: midX, y: bandY + 24, text: '共通點', size: 12, weight: 800, fill: 'var(--color-success)' });
  centerText(banded, { x: midX, y: bandY + 45, text: '兩套都只有「前鋒（Striker）」能穿越對方球門環得分', size: 13 });

  if (reduce) {
    // 靜態並排：兩卡全顯示，不輪播
    gFai.attr('opacity', 1);
    gFida.attr('opacity', 1);
    return;
  }

  // 卡片淡入 → 逐列高亮輪播
  gFai.attr('opacity', 0).transition().duration(600).attr('opacity', 1);
  gFida.attr('opacity', 0).transition().delay(350).duration(600).attr('opacity', 1);

  const cycle = 1500;
  loop(reduce, cycle, (_t, elapsed) => {
    if (elapsed < 950) return; // 等兩卡淡入後才開始輪播
    const e = elapsed - 950;
    const idx = Math.floor(e / cycle) % rows.length;
    const phase = (e % cycle) / cycle;
    hl.attr('y', rowY(idx) - (rowH - 6) / 2).attr('opacity', 0.16 * Math.sin(phase * Math.PI));
  });
}

// 避免未使用型別警告
export type { Sel };
