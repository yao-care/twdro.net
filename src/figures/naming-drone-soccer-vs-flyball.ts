// 命名關係圖：「無人機足球」（藍）與「無人機飛球」（橘）兩個稱呼，
// 指向中央同一顆球機（同一項運動 Drone Soccer），註明各自的用詞來源與慣用場合。
import { scaffold, TEAM_A, TEAM_B, drone, roundedBox, centerText, loop, type Sel } from './_base';

type Name = {
  x: number;
  y: number;
  team: string;
  title: string;
  source: string;
  lines: string[];
};

export default function draw(mount: HTMLElement) {
  const { svg, W, H, reduce } = scaffold(mount, { W: 640, H: 320, title: '同一項運動的兩種稱呼（英文皆為 Drone Soccer）' });

  const cx = W / 2, cy = 175;

  // 中央實體：一顆包著防護殼的球機
  const core = svg.append('g');
  core.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 34)
    .attr('fill', 'none').attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3').attr('opacity', 0.7);
  const ball = drone(core, { x: cx, y: cy, r: 22, fill: 'var(--color-ball)', stroke: 'var(--color-surface)', strokeWidth: 2 });
  centerText(core, { x: cx, y: cy + 58, text: '同一顆球機、同一項運動', size: 12, weight: 700 });
  centerText(core, { x: cx, y: cy + 74, text: '規則、場地、計分皆相同', size: 10.5, fill: 'var(--color-text-muted)' });

  const names: Name[] = [
    {
      x: 130, y: 150, team: 'a', title: '無人機足球',
      source: '較常見的譯名',
      lines: ['借用傳統足球「進球得分」', '意象，較容易望文生義'],
    },
    {
      x: 510, y: 150, team: 'b', title: '無人機飛球',
      source: '部分賽事與媒體慣用',
      lines: ['強調三維空間飛行、', '球機操控的特性'],
    },
  ];

  // 連線：由氣泡指向中央球機（虛線帶箭頭，保留原樣，非 annotate 的實線）
  names.forEach((n) => {
    const dir = n.x < cx ? 1 : -1;
    const startX = n.x + dir * 82;
    const endX = cx - dir * 40;
    svg.append('line')
      .attr('x1', startX).attr('y1', n.y).attr('x2', endX).attr('y2', cy)
      .attr('stroke', 'var(--color-text-muted)').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5 4').attr('marker-end', 'url(#fig-arrow)').attr('opacity', 0.75);
  });

  // 兩個名稱氣泡
  const groups = names.map((n) => {
    const color = n.team === 'a' ? TEAM_A : TEAM_B;
    const g = svg.append('g').attr('data-team', n.team);
    const box = roundedBox(g, { x: n.x - 82, y: n.y - 62, w: 164, h: 124, rx: 10, fill: 'var(--color-surface)', stroke: color, strokeWidth: 2.5 });
    g.append('circle').attr('cx', n.x - 62).attr('cy', n.y - 40).attr('r', 6).attr('fill', color);
    centerText(g, { x: n.x - 48, y: n.y - 35, text: n.title, size: 15, weight: 800, anchor: 'start' });
    centerText(g, { x: n.x, y: n.y - 10, text: n.source, size: 11, weight: 700, fill: color });
    n.lines.forEach((ln, i) => {
      centerText(g, { x: n.x, y: n.y + 14 + i * 17, text: ln, size: 11, fill: 'var(--color-text-muted)' });
    });
    return box;
  });

  // 本站用法註記
  centerText(svg, { x: cx, y: H - 14, text: '本站以「無人機足球」為正式分類，「無人機飛球」視為同義詞', size: 10.5, fill: 'var(--color-text-muted)' });

  if (reduce) {
    groups.forEach((b) => b.attr('stroke-width', 2.5));
    return;
  }

  // 輕動畫：兩氣泡交替高亮，中央球機同步微微脈動
  const T = 3200;
  loop(reduce, T, (t, elapsed) => {
    const activeA = t < 0.5;
    groups.forEach((b, i) => {
      const on = i === 0 ? activeA : !activeA;
      b.attr('stroke-width', on ? 4 : 2.5).attr('opacity', on ? 1 : 0.7);
    });
    ball.attr('r', 22 + 1.6 * Math.sin(elapsed / 500));
  });
}

// 避免未使用型別警告
export type { Sel };
