// list_price 是自由文字欄位（來源怎麼標就怎麼存），常見形態：
//   'NT$5,858'
//   'NT$47,700（含遙控器、電池 10 顆、1 年保固維修方案）'
//   'NT$4,350（TDA002 一機兩電）／NT$5,950（TDA204 一機六電，教育單位／課程用專案品項）'
//   'NT$9,700（已完售；教育單位／課程用專案品項）'
// 器材頁摘要、標題與比較表都需要「短版價格」與「排序用數字」，集中在這裡，
// 避免三處各自寫一套正則而彼此不一致。

export interface ParsedPrice {
  /** 短版顯示值，如 'NT$4,350 起'、'NT$9,700（已完售）'；無價格則 null */
  text: string | null;
  /** 排序用的數值（取開頭價格）；無價格則 null */
  amount: number | null;
  /** 來源文字是否標明已完售 */
  soldOut: boolean;
}

const LEAD = /^NT\$[\d,]+(?:\s*[–—-]\s*[\d,]+)?/;

export function parsePrice(listPrice?: string): ParsedPrice {
  if (!listPrice) return { text: null, amount: null, soldOut: false };
  const lead = listPrice.match(LEAD)?.[0] ?? null;
  if (!lead) return { text: null, amount: null, soldOut: /已完售/.test(listPrice) };

  const soldOut = /已完售/.test(listPrice);
  // 出現第二個 NT$ 表示同型號有多個品項多個價位，標「起」才不會讓人以為只有一種價。
  const multi = (listPrice.match(/NT\$/g) ?? []).length > 1;
  const text = soldOut ? `${lead}（已完售）` : multi ? `${lead} 起` : lead;
  // 區間價（NT$13,000–15,000）取下界排序，與畫面上「起」的語意一致。
  const amount = Number(lead.match(/[\d,]+/)?.[0].replace(/,/g, '')) || null;

  return { text, amount, soldOut };
}

// motor_type 存的是資料來源的英文原值。給中文讀者看要對照；未知值原樣保留，不猜。
const MOTOR_ZH: Record<string, string> = { brushed: '有刷', brushless: '無刷' };
export function motorLabel(motorType?: string): string | null {
  if (!motorType) return null;
  return MOTOR_ZH[motorType] ?? motorType;
}

// 品牌欄位帶英文全名（「宇宙機器人（kodorobot）」）。放在標題開頭會把型號——也就是
// 使用者實際打進搜尋框的字——擠出搜尋結果標題的可見範圍，所以另備短版。
export function shortBrand(brand: string): string {
  return brand.replace(/（[^）]*）\s*$/, '');
}
