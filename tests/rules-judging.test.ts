import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
//
// /rules/compare/ 的「裁判怎麼配置、誰說了算」一段，是站上唯一並排四套規則判決制度的地方
// （Bing 對「無人機足球」回的建議字裡就有「無人機足球裁判」，而站上原本一頁都沒承接）。
// 那一段的條文清單是用 tags 篩出來的——tag 打錯或被拿掉，畫面只會少列一條，
// 沒有人看得出來少了什麼。這裡把它釘死。

const JUDGING_TAGS = ['裁判', '判決', '犯規', '黃牌', '紅牌', '罰球'];
const dir = 'src/content/rules';
const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
const read = (f: string) => readFileSync(`${dir}/${f}`, 'utf8');
const tagsOf = (raw: string) =>
  (raw.match(/^tags:\n((?:\s+- .*\n)+)/m)?.[1] ?? '')
    .split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);

const html = readFileSync('dist/rules/compare/index.html', 'utf8');

describe('/rules/compare/ 的判決條文區塊', () => {
  it('每一條帶判決類 tag 的條文都出現在頁面上', () => {
    const judging = files.filter((f) => tagsOf(read(f)).some((t) => JUDGING_TAGS.includes(t)));
    expect(judging.length).toBeGreaterThanOrEqual(4);
    const missing = judging.filter((f) => {
      const title = read(f).match(/^title:\s*(.*)$/m)?.[1]?.trim() ?? '';
      return title && !html.includes(title);
    });
    expect(missing).toEqual([]);
  });

  it('三套規則的裁判編制敘述仍與條文原文相符', () => {
    // 這三句是文中直接寫給讀者的結論，來源就是下面列出的條文 summary。
    // 條文改了而結論沒改，站上就會出現沒有依據的敘述（站規鐵則 5）。
    const fida = read('fida-2026-penalty.yml');
    expect(fida).toContain('主裁判指示兩位助理裁判');
    expect(html).toContain('主裁判加兩位助理裁判');

    const fai = read('fai-f9a-b-2026-fouls.yml');
    expect(fai).toContain('所有處罰由主審裁定');
    expect(html).toContain('所有處罰由主審裁定');

    const skycup = read('skycup-2026-judging.yml');
    expect(skycup).toContain('以主審的判決為準');
    expect(html).toContain('以主審為準');
  });

  it('summary 是純文字欄位，不得夾 markdown 強調語法', () => {
    // 各處都把 summary 當純文字印（規則明細頁、比較頁）。
    // 夾 `**` 不會報錯，只會在畫面上原樣印出星號——2026-08-27 在 FIDA 兩條條文上實際發生過。
    const dirty = files.filter((f) => /\*\*/.test(read(f)));
    expect(dirty).toEqual([]);
    expect(html).not.toContain('**');
  });
});
