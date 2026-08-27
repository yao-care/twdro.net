/**
 * 縣市的網址 slug。
 *
 * 刻意是 .mjs 而不是 .ts：sitemap 的 `src/lib/lastmod.mjs` 要用同一份對照表算縣市頁的
 * lastmod，而它跑在 Astro 設定載入階段、只吃純 JS。抄第二份的話兩邊會走鐘，
 * 而走鐘的樣子是「某個縣市頁沒有 lastmod」——沒有人看得出來。
 *
 * 為什麼要一份對照表而不是直接把中文放進網址（2026-08-27）：
 * 縣市是**封閉且穩定的集合**（22 個，不會隨資料成長），寫死一次就不必再維護；
 * 換成中文網址雖然省掉這張表，但每個連結都會變成 percent-encoded，
 * 站內連結、測試斷言與 sitemap 比對都要跟著處理編碼，而收益只有網址好看一點。
 *
 * 反過來說，**賽事系列**是開放集合（今天九個，之後還會長），那種就不適合用寫死的表。
 *
 * 站上資料的縣市欄位混用「臺／台」，所以正規化時兩種都要收——
 * 這不是統一用字的問題，事實型資料照來源原文寫，是讀取端負責對齊。
 */

/** @type {Record<string, string>} */
export const CITY_SLUGS = {
  臺北市: 'taipei', 新北市: 'new-taipei', 桃園市: 'taoyuan', 臺中市: 'taichung',
  臺南市: 'tainan', 高雄市: 'kaohsiung', 基隆市: 'keelung', 新竹市: 'hsinchu-city',
  新竹縣: 'hsinchu-county', 苗栗縣: 'miaoli', 彰化縣: 'changhua', 南投縣: 'nantou',
  雲林縣: 'yunlin', 嘉義市: 'chiayi-city', 嘉義縣: 'chiayi-county', 屏東縣: 'pingtung',
  宜蘭縣: 'yilan', 花蓮縣: 'hualien', 臺東縣: 'taitung', 澎湖縣: 'penghu',
  金門縣: 'kinmen', 連江縣: 'lienchiang',
};

/** 「台北市」與「臺北市」都正規化成「臺」。@param {string|null|undefined} city */
export function normalizeCity(city) {
  if (!city) return null;
  return city.trim().replace(/^台/, '臺');
}

/** @param {string|null|undefined} city */
export function citySlug(city) {
  const name = normalizeCity(city);
  return name ? (CITY_SLUGS[name] ?? null) : null;
}

/** @param {string} slug */
export function cityFromSlug(slug) {
  return Object.entries(CITY_SLUGS).find(([, s]) => s === slug)?.[0] ?? null;
}
