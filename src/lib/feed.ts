/**
 * 訂閱來源（RSS 與 iCalendar）的編碼工具。
 *
 * 為什麼站上要有這兩份（2026-08-03）：本站最有時效性的資產是「報名截止日」與
 * 「成績公布」，但在此之前讀者看過一次之後沒有任何機制把他們叫回來——下次開放報名時
 * 只能靠自己記得再搜一次。RSS 讓聚合器與機器抓得到更新，.ics 讓家長與教師把報名截止日
 * 放進自己的日曆。兩者都是靜態檔，隨站部署，不需要後端。
 *
 * 這裡只放純函式（不碰 astro:content），因為 iCalendar 的折行與跳脫規則是最容易寫錯
 * 又最不容易被眼睛看出來的部分：折錯行的 .ics 在某些日曆軟體會整份匯入失敗，
 * 但檔案照樣產生、build 照樣過。tests/feeds.test.ts 針對這些規則逐條釘住。
 */

/** XML 文字節點與屬性值的跳脫。RSS 的標題含「＆」與引號時會壞掉。 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `YYYY-MM-DD` → RSS 2.0 要求的 RFC 822 日期。
 *
 * 站上的日期一律是臺灣的日曆日（查核日、公告日），所以固定標 +0800——標成 UTC 會讓
 * 凌晨的項目在讀者的閱讀器裡退一天，跟 sitemap lastmod 當初踩過的是同一個坑。
 */
export function rfc822(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const dd = String(d).padStart(2, '0');
  return `${dow}, ${dd} ${MONTHS[m - 1]} ${y} 00:00:00 +0800`;
}

/** RFC 5545 §3.3.11：反斜線、分號、逗號要跳脫，換行寫成字面上的 \n。 */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 內容行折行：每行最多 75 個**位元組**，續行以一個空格開頭。
 *
 * 關鍵在「位元組」而非字元——中文一字 3 bytes，用長度切會超標；而按 byte 硬切又會
 * 把一個中文字剖成兩半、產出無效 UTF-8。故逐 code point 累加，超過就換行。
 * 續行開頭那個空格本身也計入 75。
 */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** `YYYY-MM-DD` → `YYYYMMDD`（全天事件的 VALUE=DATE 格式）。 */
export function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

/**
 * 全天事件的 DTEND 是**排他**的：8/1–8/2 的賽事要寫成 DTEND:20260803，
 * 否則日曆上只會顯示到 8/1。跨月跨年由 Date 處理，不自己算天數。
 */
export function icsDatePlusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 折行後以 CRLF 串接。RFC 5545 規定行尾必須是 CRLF，最後一行也要。 */
export function icsLines(lines: string[]): string {
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** 是否為合法的 `YYYY-MM-DD`。資料是人工填的，格式壞掉時寧可略過該項也不要產出壞檔。 */
export function isDate(s: string | undefined): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
