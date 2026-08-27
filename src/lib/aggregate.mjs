/**
 * 彙整頁的網址與共用查詢。
 *
 * slug 策略分兩種，是刻意的（2026-08-27）：
 * - **封閉集合用 ASCII 對照表**：縣市固定 22 個，寫死一次不必再維護，網址乾淨（見 geo.mjs）。
 * - **開放集合直接用中文**：賽事系列、學校會隨資料一直長。用對照表就得每加一筆資料回來改
 *   程式，而漏改的樣子是「那一頁不存在」——沒有人看得出來。中文網址實測可行：
 *   Astro 產出的目錄就是中文，@astrojs/sitemap 會自動 percent-encode，
 *   而搜尋結果上顯示的是解碼後的中文，對 zh-TW 讀者反而更好認。
 *
 * 站內連結一律經 `aggHref()` 產生，確保 HTML 與 sitemap 用的是同一種編碼。
 */

/** 彙整頁連結：中文段落先編碼，避免 HTML 與 sitemap 對不上。 */
export function aggHref(base, value) {
  return `${base}${encodeURIComponent(String(value))}/`;
}

/** 年度取自賽事開始日；沒有日期的賽事不進年度頁。 */
export function yearOf(eventStart) {
  return typeof eventStart === 'string' && /^\d{4}/.test(eventStart) ? eventStart.slice(0, 4) : null;
}
