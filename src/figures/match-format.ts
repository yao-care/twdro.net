// 賽制示意：三局兩勝（Best of 3）＋每局 180 秒圓形計時環，先贏 2 局者勝、不必打滿。
import { scaffold, TEAM_A, TEAM_B, roundedBox, centerText, loop, type Sel } from './_base';

// 三局的示意結果（局勝負為舉例，用來說明「多者勝該局、先贏 2 局者勝」）。
type Game = { no: number; a: number; b: number; winner: 'a' | 'b' };
const GAMES: Game[] = [
  { no: 1, a: 3, b: 1, winner: 'a' }, // A 勝
  { no: 2, a: 2, b: 1, winner: 'a' }, // A 再勝 → 先到 2 局
  { no: 3, a: 0, b: 0, winner: 'a' }, // 不需進行（A 已先贏 2 局）
];
const PER_GAME_SEC = 180; // 每局 180 秒（3 分鐘），取自文章
const CX = [145, 320, 495];
const RING_CY = 140;
const R_OUT = 42;
const R_IN = 34;

export default function draw(mount: HTMLElement) {
  const { d3, svg, W, reduce } = scaffold(mount, {
    W: 640,
    H: 340,
    title: '三局兩勝賽制・每局 180 秒（示意）',
  });

  const teamColor = (w: 'a' | 'b') => (w === 'a' ? TEAM_A : TEAM_B);
  // 計時環為本圖特有（d3.arc），不套用共用元件，保留原樣。
  const arcGen = d3
    .arc<{ endAngle: number }>()
    .innerRadius(R_IN)
    .outerRadius(R_OUT)
    .startAngle(0)
    .cornerRadius(4);

  // ── 每個局格 ────────────────────────────────────────────────
  type Box = {
    g: Game;
    cx: number;
    box: Sel;
    prog: Sel;
    secTxt: Sel;
    unitTxt: Sel;
    scoreG: Sel;
    aNum: Sel;
    bNum: Sel;
    badge: Sel;
    skip: Sel;
  };

  const boxes: Box[] = GAMES.map((g, i) => {
    const cx = CX[i];
    const box = roundedBox(svg, { x: cx - 72, y: 48, w: 144, h: 210, rx: 10 });

    centerText(svg, { x: cx, y: 74, text: `第 ${g.no} 局`, size: 13, weight: 700 });

    // 計時環：底軌 + 進度弧（d3.arc，本圖特有，保留）
    svg
      .append('path')
      .attr('transform', `translate(${cx} ${RING_CY})`)
      .attr('d', arcGen({ endAngle: 2 * Math.PI })!)
      .attr('fill', 'var(--color-border)')
      .attr('opacity', 0.5);
    const prog = svg
      .append('path')
      .attr('transform', `translate(${cx} ${RING_CY})`)
      .attr('fill', 'var(--color-tech)')
      .attr('d', arcGen({ endAngle: 0 })!);

    // 環內：已用秒數 + /180秒
    const secTxt = centerText(svg, { x: cx, y: RING_CY + 2, text: '—', size: 18, weight: 800 });
    const unitTxt = centerText(svg, {
      x: cx,
      y: RING_CY + 18,
      text: `/ ${PER_GAME_SEC} 秒`,
      size: 9,
      fill: 'var(--color-text-muted)',
    });

    // 比分（多者勝該局）：A 進球（藍） : B 進球（橘）
    const scoreG = svg.append('g').attr('opacity', 0) as unknown as Sel;
    const aNum = centerText(scoreG, { x: cx - 14, y: 214, text: String(g.a), size: 20, weight: 800, fill: TEAM_A, anchor: 'end' });
    centerText(scoreG, { x: cx, y: 213, text: ':', size: 15, fill: 'var(--color-text-muted)' });
    const bNum = centerText(scoreG, { x: cx + 14, y: 214, text: String(g.b), size: 20, weight: 800, fill: TEAM_B, anchor: 'start' });

    // 勝方徽章（初始隱藏，settle 時再上色與填字）
    const badge = centerText(svg, { x: cx, y: 240, text: '', size: 11, weight: 700 }).attr('opacity', 0);

    // 第 3 局「不需進行」遮罩
    const skip = centerText(svg, {
      x: cx,
      y: RING_CY + 2,
      text: '不需進行',
      size: 12,
      weight: 700,
      fill: 'var(--color-text-muted)',
    }).attr('opacity', 0);

    return { g, cx, box, prog, secTxt, unitTxt, scoreG, aNum, bNum, badge, skip };
  });

  // ── 底部：勝負宣告 + 規則說明 ──────────────────────────────
  const champLine = centerText(svg, { x: W / 2, y: 320, text: '', size: 12, weight: 700 }).attr('opacity', 0);

  const note = centerText(svg, {
    x: W / 2,
    y: 320,
    text: '每局比進球數，多者勝該局；先贏 2 局者贏得整場，不必打滿。',
    size: 11,
    fill: 'var(--color-text-muted)',
  });

  // 呈現「某局判定完成」
  const settle = (b: Box) => {
    b.prog.attr('d', arcGen({ endAngle: 2 * Math.PI })!).attr('fill', teamColor(b.g.winner));
    b.secTxt.text(PER_GAME_SEC);
    b.scoreG.attr('opacity', 1);
    b.box.attr('stroke', teamColor(b.g.winner)).attr('stroke-width', 2.5);
    b.badge
      .attr('opacity', 1)
      .attr('fill', teamColor(b.g.winner))
      .text(`◆ ${b.g.winner === 'a' ? 'A' : 'B'} 隊勝此局`);
  };

  // 第 3 局標為「不需進行」
  const markSkipped = (b: Box) => {
    b.secTxt.attr('opacity', 0);
    b.unitTxt.attr('opacity', 0);
    b.skip.attr('opacity', 1);
    b.box.attr('stroke-dasharray', '5 4').attr('opacity', 0.6);
  };

  const showChampion = () => {
    note.attr('opacity', 0);
    champLine
      .attr('opacity', 1)
      .attr('fill', TEAM_A)
      .text('A 隊先贏 2 局 → 贏得整場（不必打滿）');
  };

  // ── 靜態分支（reduced-motion）────────────────────────────
  if (reduce) {
    settle(boxes[0]);
    settle(boxes[1]);
    markSkipped(boxes[2]);
    showChampion();
    return;
  }

  // ── 動畫：計時環依序掃動、局格依序判定 ────────────────────
  // 時間軸（占整段循環比例）
  const T = 9000;
  const G1_RUN = [0.0, 0.32];
  const G1_HOLD = [0.32, 0.42];
  const G2_RUN = [0.42, 0.74];
  const G2_HOLD = [0.74, 0.84];
  // 0.84–1.0：宣告 A 隊獲勝、第 3 局不需進行

  const seconds = (p: number) => Math.min(PER_GAME_SEC, Math.round(p * PER_GAME_SEC));

  const resetBox = (b: Box, pending: boolean) => {
    b.prog.attr('d', arcGen({ endAngle: 0 })!).attr('fill', 'var(--color-tech)');
    b.scoreG.attr('opacity', 0);
    b.badge.attr('opacity', 0);
    b.box.attr('stroke', 'var(--color-border)').attr('stroke-width', 1.5).attr('opacity', 1).attr('stroke-dasharray', null);
    b.secTxt.attr('opacity', 1).text(pending ? '—' : 0);
    b.unitTxt.attr('opacity', 1);
    b.skip.attr('opacity', 0);
  };

  loop(reduce, T, (t, elapsed) => {
    // 每圈起點重置狀態
    resetBox(boxes[0], t < G1_RUN[1]);
    resetBox(boxes[1], t < G2_RUN[0]);
    resetBox(boxes[2], true);
    boxes[2].secTxt.text('—');
    champLine.attr('opacity', 0);
    note.attr('opacity', 1);

    // 第 1 局
    if (t < G1_RUN[1]) {
      const p = Math.min(1, (t - G1_RUN[0]) / (G1_RUN[1] - G1_RUN[0]));
      boxes[0].prog.attr('d', arcGen({ endAngle: 2 * Math.PI * p })!);
      boxes[0].secTxt.text(seconds(p));
    } else {
      settle(boxes[0]);
    }

    // 第 2 局
    if (t < G2_RUN[0]) {
      // 尚未開打
    } else if (t < G2_RUN[1]) {
      const p = Math.min(1, (t - G2_RUN[0]) / (G2_RUN[1] - G2_RUN[0]));
      boxes[1].prog.attr('d', arcGen({ endAngle: 2 * Math.PI * p })!);
      boxes[1].secTxt.text(seconds(p));
    } else {
      settle(boxes[1]);
    }

    // 第 3 局：只有進入宣告階段才標「不需進行」
    if (t >= G2_HOLD[1]) {
      markSkipped(boxes[2]);
      showChampion();
    }

    // 判定完成後輕微脈動高亮已贏局的邊框
    if (t >= G1_HOLD[0]) {
      const pulse = 2.5 + 0.8 * Math.sin(elapsed / 260);
      if (t < G1_HOLD[1]) boxes[0].box.attr('stroke-width', pulse);
      if (t >= G2_HOLD[0] && t < G2_HOLD[1]) boxes[1].box.attr('stroke-width', pulse);
    }
  });
}

// 避免未使用型別警告
export type { Sel };
