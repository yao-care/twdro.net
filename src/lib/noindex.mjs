/**
 * 稀薄頁不進索引：哪些頁帶 noindex、同時移出 sitemap。
 *
 * 2026-10-14 用戶拍板。當時的量測（帶日期的紀錄，不是現況）：
 * - sitemap 201 個網址，Google 只收錄 85 個；116 個未收錄的頁裡 115 個從沒被爬過。
 * - 未收錄的大宗是 2026-08-27 一次加上的彙整頁與場館明細，`<main>` 正文抽樣：
 *   場館明細約 66 字、學校隊伍頁約 272 字、縣市頁約 400 字，對照入門文約 1,700 字。
 * - 同期 Bing／Yahoo 會把站上的頁帶給臺灣讀者，Google 卻幾乎不來爬——整站有三分之一以上
 *   是幾行字的明細頁，Google 對整站的評價被這批頁拖著走。
 *
 * 做法：頁面保留、站內連結照常（noindex,follow），只是不請 Google 收錄，把爬取集中到
 * 有內容的頁。hub 頁（/venues/、/teams/、/events/…）本身不在規則內，照常收錄。
 *
 * 判定在建置產物上做（scripts/apply-noindex.mjs），不在模板裡做：賽事系列頁要不要收錄
 * 是看它實際印出多少正文，而正文長度只有產出 HTML 之後才量得到。sitemap 排除與頁面
 * noindex 由同一支腳本同時處理，兩邊不會各說各話（scripts/check-sitemap-noindex.mjs 再守一次）。
 */

/** 這些前綴底下的明細頁一律 noindex（前綴本身若是 hub 頁則不算）。 */
export const NOINDEX_PREFIXES = ['/venues/', '/teams/school/', '/events/city/', '/events/year/'];

/**
 * 依正文字數決定的前綴：正文（`<main>` 去標籤、去空白後的字元數）達門檻才收錄。
 *
 * 賽事系列頁的門檻 450 字（2026-10-14 訂）。當天線上 16 個系列頁的正文落在 202–805 字：
 * 只有一兩場賽事的系列多在 200–380 字，內容就是一張賽事卡加一行規則；
 * 450 字以上的才有多場次、規則對照與成績清單，是搜系列名的人真的用得到的頁。
 * 調門檻前先重量一次分佈（node scripts/apply-noindex.mjs --report dist）。
 */
export const MEASURED_PREFIXES = [{ prefix: '/events/series/', minMainChars: 450 }];

/** `<main>` 的正文字元數（去 script/style、去標籤、去空白）。沒有 <main> 就量整頁。 */
export function mainTextLength(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  let t = m ? m[0] : html;
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, 'x');
  return t.replace(/\s+/g, '').length;
}

/**
 * 判定一頁要不要 noindex。pathname 用解碼前或解碼後皆可（一律先解碼再比對）。
 * 回傳 { noindex: boolean, reason: string }。
 */
export function decideNoindex(pathname, html) {
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* 保留原樣 */ }
  for (const prefix of NOINDEX_PREFIXES) {
    if (p.startsWith(prefix) && p !== prefix) return { noindex: true, reason: `前綴 ${prefix}` };
  }
  for (const { prefix, minMainChars } of MEASURED_PREFIXES) {
    if (p.startsWith(prefix) && p !== prefix) {
      const n = mainTextLength(html ?? '');
      return n < minMainChars
        ? { noindex: true, reason: `正文 ${n} 字 < ${minMainChars}` }
        : { noindex: false, reason: `正文 ${n} 字 ≥ ${minMainChars}` };
    }
  }
  return { noindex: false, reason: '' };
}

export const NOINDEX_META = '<meta name="robots" content="noindex,follow">';

/** 在 <head> 開頭插入 noindex meta；已有 robots meta 的頁不重複插。 */
export function injectNoindex(html) {
  if (/<meta[^>]+name=["']?robots["']?/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>${NOINDEX_META}`);
}

/** 從 sitemap XML 移除指定 pathname（已解碼）的 <url> 項目。回傳 { xml, removed }。 */
export function pruneSitemap(xml, pathnames) {
  let removed = 0;
  const out = xml.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) return block;
    let p;
    try { p = decodeURIComponent(new URL(loc).pathname); } catch { return block; }
    if (pathnames.has(p)) { removed += 1; return ''; }
    return block;
  });
  return { xml: out, removed };
}
