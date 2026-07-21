// 「第一次參加比賽要準備什麼」示意：分三類的賽前準備清單，逐項打勾亮綠。
import { scaffold, roundedBox, checkmark, loop, type Sel } from './_base';

type Item = { text: string };
type Col = { title: string; items: Item[] };

export default function draw(mount: HTMLElement) {
  const { svg, W, H, reduce } = scaffold(mount, { W: 640, H: 300, title: '賽前準備清單・逐項備妥再出發' });

  // 三類清單，內容全部取自文章各段落
  const cols: Col[] = [
    { title: '器材合規', items: [
      { text: '球體直徑・重量合規' },
      { text: '防護框完整無破損' },
      { text: 'fail-safe 正常' },
    ] },
    { title: '隊伍與規則', items: [
      { text: '排好前鋒與掩護分工' },
      { text: '演練突破與防守攔截' },
      { text: '確認 FAI／FIDA 規則' },
    ] },
    { title: '檢錄與備品', items: [
      { text: '提早到場預留檢錄' },
      { text: '帶足備用電池零件' },
      { text: '對照主辦單位簡章' },
    ] },
  ];

  const leftM = 18, gap = 14;
  const colW = (W - 2 * leftM - 2 * gap) / 3; // 192
  const colX = (c: number) => leftM + c * (colW + gap);
  const rowH = 42, rowGap = 10, top0 = 64;
  const rowTop = (r: number) => top0 + r * (rowH + rowGap);
  const CHK = 18;

  // 每個 checkbox 與勾勾的選擇集，供動畫更新
  const boxes: { rect: Sel; reveal: (p: number) => void; label: Sel }[] = [];

  cols.forEach((col, c) => {
    const cx = colX(c);
    // 欄標題
    svg.append('text').attr('x', cx + colW / 2).attr('y', 50)
      .attr('text-anchor', 'middle').attr('font-size', 13).attr('font-weight', 700)
      .attr('fill', 'var(--color-text)').text(col.title);
    // 標題底下的強調線
    svg.append('line').attr('x1', cx + colW / 2 - 26).attr('y1', 56).attr('x2', cx + colW / 2 + 26).attr('y2', 56)
      .attr('stroke', 'var(--color-tech)').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');

    col.items.forEach((it, r) => {
      const bt = rowTop(r);
      // 項目外框
      roundedBox(svg, { x: cx, y: bt, w: colW, h: rowH, rx: 6, fill: 'var(--color-surface)', strokeWidth: 1 });
      const bx = cx + 12, by = bt + (rowH - CHK) / 2;
      // 勾選框
      const rect = roundedBox(svg, { x: bx, y: by, w: CHK, h: CHK, rx: 4, fill: 'none', stroke: 'var(--color-border)', strokeWidth: 2 });
      // 勾勾（以 dashoffset 揭示）
      const { reveal } = checkmark(svg, { x: bx, y: by, size: CHK });
      // 項目文字
      const label = svg.append('text').attr('x', bx + CHK + 10).attr('y', bt + rowH / 2 + 4)
        .attr('font-size', 12).attr('fill', 'var(--color-text)').text(it.text);
      boxes.push({ rect, reveal, label });
    });
  });

  const footer = svg.append('text').attr('x', W / 2).attr('y', H - 16)
    .attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 700)
    .attr('fill', 'var(--color-text-muted)');

  const setChecked = (i: number, p: number) => {
    // p：0=未勾、1=完全勾選
    const { rect, reveal, label } = boxes[i];
    reveal(p);
    if (p > 0.05) {
      rect.attr('stroke', 'var(--color-success)');
      label.attr('fill', 'var(--color-text-muted)');
    } else {
      rect.attr('stroke', 'var(--color-border)');
      label.attr('fill', 'var(--color-text)');
    }
  };

  const N = boxes.length;

  if (reduce) {
    boxes.forEach((_, i) => setChecked(i, 1));
    footer.text(`${N}／${N} 項準備就緒`);
    return;
  }

  const step = 620, reveal = 300, hold = 2200;
  const T = N * step + hold;
  loop(reduce, T, (_t, elapsed) => {
    const t = elapsed % T;
    let done = 0;
    for (let i = 0; i < N; i++) {
      const p = Math.max(0, Math.min(1, (t - i * step) / reveal));
      setChecked(i, p);
      if (p >= 1) done++;
    }
    footer.text(done >= N ? `${N}／${N} 項準備就緒` : `已完成 ${done}／${N} 項`);
  });
}
