/**
 * 無人機足球預算試算：把「一台多少錢」換算成「一隊／一個班要編多少預算」。
 *
 * 為什麼是工具而不是又一篇文章（2026-08-27，依 GSC 近 90 天實測）：
 * 「無人機足球價格」21 次曝光、「無人機足球購買」13 次，是全站最大的兩個查詢，
 * 但 SERP 由可直接下單的賣場佔滿，導購意圖我們滿足不了（playbook 2026-07-30 已驗證）。
 * 賣場給不了的是**跨品牌的整隊總價**——他們只賣自家一款。這支就是算那個數字。
 *
 * 所有數字都從 src/content/equipment 與 src/content/rulebooks 推導，不寫死任何價格；
 * 資料變了算出來就跟著變，站規鐵則 5（站上不得出現沒有依據的敘述）才守得住。
 */

/** 中文數字（球機規格與品項名慣用「一機兩電」「一機六電」這種寫法） */
const ZH_DIGIT: Record<string, number> = {
  一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const toCount = (raw: string): number | null => {
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return ZH_DIGIT[raw] ?? null;
};

/**
 * 從單一 list_price 字串推導「一顆電池大約多少錢」。
 *
 * 依據的是站上真實存在的一種標價方式：同一款球機因為配幾顆電池而有兩個價
 * （例：`NT$4,350（TDA002 一機兩電）／NT$5,950（TDA204 一機六電…）`）。
 * 兩個價的差額除以電池顆數差，就是那台機的單顆電池成本——比任何概略估算都準，
 * 而且 /learn/entry-cost/ 已經公開教讀者這樣算，工具只是替他算完。
 *
 * 推導不出來就回 null（呼叫端要據此隱藏電池那一行，而不是掰一個數字）。
 */
export function batteryUnitPrice(listPrice?: string): number | null {
  if (!listPrice) return null;
  // 逐段配對「價格 …（… N 電 …）」，段落以全形／半形斜線分隔。
  const pairs: { price: number; cells: number }[] = [];
  for (const seg of listPrice.split(/[／/]/)) {
    const price = Number(seg.match(/NT\$([\d,]+)/)?.[1]?.replace(/,/g, ''));
    const cells = toCount(seg.match(/一機([\d一二兩三四五六七八九十]+)電/)?.[1] ?? '');
    if (Number.isFinite(price) && cells != null) pairs.push({ price, cells });
  }
  if (pairs.length < 2) return null;
  pairs.sort((a, b) => a.cells - b.cells);
  const lo = pairs[0], hi = pairs[pairs.length - 1];
  if (hi.cells === lo.cells) return null;
  const unit = (hi.price - lo.price) / (hi.cells - lo.cells);
  return unit > 0 ? Math.round(unit) : null;
}

export interface BudgetInput {
  /** 單台球機參考售價 */
  dronePrice: number;
  /** 上場台數 */
  activeDrones: number;
  /** 備援機台數（比賽中撞壞就靠這個） */
  spareDrones: number;
  /** 每台額外備幾顆電池 */
  batteriesPerDrone: number;
  /** 單顆電池推估價；null 代表推導不出來，不列入計算 */
  batteryUnit: number | null;
  /** 備品預留比例（槳、防護框、機臂），對球機小計取百分比 */
  sparePartsRate: number;
}

export interface BudgetLine {
  label: string;
  detail: string;
  amount: number;
}

export interface BudgetResult {
  lines: BudgetLine[];
  total: number;
  droneCount: number;
}

export function calcBudget(i: BudgetInput): BudgetResult {
  const droneCount = Math.max(0, i.activeDrones) + Math.max(0, i.spareDrones);
  const droneSubtotal = droneCount * i.dronePrice;
  const lines: BudgetLine[] = [
    {
      label: '球機',
      detail: `${droneCount} 台 × NT$${i.dronePrice.toLocaleString('en-US')}`
        + (i.spareDrones > 0 ? `（含備援 ${i.spareDrones} 台）` : ''),
      amount: droneSubtotal,
    },
  ];

  const batteryCount = Math.max(0, i.batteriesPerDrone) * droneCount;
  if (i.batteryUnit != null && batteryCount > 0) {
    lines.push({
      label: '額外電池',
      detail: `${batteryCount} 顆 × 推估 NT$${i.batteryUnit.toLocaleString('en-US')}`,
      amount: batteryCount * i.batteryUnit,
    });
  }

  if (i.sparePartsRate > 0) {
    lines.push({
      label: '備品預留',
      detail: `球機小計的 ${Math.round(i.sparePartsRate * 100)}%（槳、防護框、機臂）`,
      amount: Math.round(droneSubtotal * i.sparePartsRate),
    });
  }

  return { lines, total: lines.reduce((s, l) => s + l.amount, 0), droneCount };
}
