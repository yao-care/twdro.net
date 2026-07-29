// 資料勘誤回報連結的單一真實來源。
//
// 為什麼（2026-07-28）：站上唯一的更正管道是 /about/correction/ 的 GitHub Issue 連結，
// 而那頁只從 footer 與 /about/ 進得去——看到某場賽事日期有誤的人，正在看的是賽事頁，
// 不會先繞到「關於本站」。對本站最重要的一群讀者（賽事主辦單位、協會、學校）尤其如此：
// 「資料有誤請告訴我們」是我們對他們的主要承諾，入口卻藏在三層外。
//
// 這裡把回報入口做成帶上下文的連結，隨 SourceBlock 出現在每一個資料明細頁，
// 並預先填好頁面網址與欄位範本，讓收到的 issue 一開始就可處理。

const REPO_ISSUE_URL = 'https://github.com/yao-care/twdro.net/issues/new';

// 2026-07-29 補的第二管道。只有 GitHub Issue 時，對最該回報的那群人（協會、學校、
// 教育局、賽事主辦）是真門檻——他們多半沒有 GitHub 帳號，也不會為了改一個日期去註冊。
// 信箱走 Google Workspace（yao.care 的 MX），是既有的服務信箱而非為本站新開。
export const CORRECTION_EMAIL = 'service@yao.care';

/** 回報欄位範本，兩個管道共用，確保收到的內容格式一致。 */
function correctionBody(pageUrl: string): string {
  return [
    `資料頁：${pageUrl}`,
    '',
    '錯誤欄位：',
    '',
    '正確內容：',
    '',
    '來源證明（公告網址、簡章截圖或聯絡方式）：',
    '',
    '---',
    '若您是主辦單位或該筆資料的當事單位，請在此註明，我們會優先處理。',
  ].join('\n');
}

export interface CorrectionTarget {
  /** 資料頁路徑，如 /events/2026-skycup-tainan/ */
  path: string;
  /** 該頁標題，用於 issue 標題 */
  title: string;
}

/** 產生預先填好頁面網址與欄位範本的 GitHub issue 連結。 */
export function correctionUrl({ path, title }: CorrectionTarget): string {
  const params = new URLSearchParams({
    labels: 'data-correction',
    title: `資料更正：${title}`,
    body: correctionBody(`https://twdro.net${path}`),
  });
  return `${REPO_ISSUE_URL}?${params.toString()}`;
}

/**
 * 產生預先填好主旨與內文的 mailto 連結。
 *
 * 這裡刻意不用 URLSearchParams：它把空白編成 '+'，那是 HTTP query 的慣例，
 * 在 mailto 的主旨與內文裡會原樣顯示成加號。mailto 必須用百分比編碼。
 */
export function correctionMailto({ path, title }: CorrectionTarget): string {
  const subject = encodeURIComponent(`資料更正：${title}`);
  const body = encodeURIComponent(correctionBody(`https://twdro.net${path}`));
  return `mailto:${CORRECTION_EMAIL}?subject=${subject}&body=${body}`;
}
