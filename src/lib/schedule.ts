/**
 * 賽期的顯示字串。
 *
 * 為什麼要有這一支（2026-08-28）：同一段「有結束日就印區間、否則印單日」的邏輯，
 * 站上原本存在三份——`events/results.astro` 一份、`lib/eventSeo.ts` 一份，
 * 而**賽事明細頁那一份根本沒寫**，直接印 `event_start`。於是 2025 FIDA 世界盃
 * （9/25–9/28）、2024 UASACT 馬來西亞（12/7–8）這些多日賽事，在自己的頁面上
 * 只看得到開始日，反而是 meta description 與 JSON-LD 帶著完整區間——
 * **給爬蟲的資料比給讀者的完整**，而畫面上看不出少了東西。
 *
 * 這與 fourth_place_team 那次是同一種錯：同一件事寫兩份就會走鐘，所以只留一份。
 */

/** 起訖相同或沒有結束日 → 只印開始日。`sep` 讓已經上線的兩處維持各自的空白慣例。 */
export function dateRangeText(
  start?: string,
  end?: string,
  { sep = '～', fallback = '' }: { sep?: string; fallback?: string } = {},
): string {
  if (!start) return fallback;
  return end && end !== start ? `${start}${sep}${end}` : start;
}
