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

/**
 * 成績提供的欄位範本（2026-07-30）。
 *
 * 為什麼要跟勘誤分開一支：站上四場已結束的賽事沒有成績，而實查後**全臺沒有任何可爬取的
 * 網頁在公布無人機足球賽事成績**——連主辦單位官網都沒有（成績只在其 FB，需登入態）。
 * 既然抓不到，就把管道開給看得到成績的人：到過現場的隊伍、指導老師、承辦學校。
 *
 * 範本刻意做兩件事：
 * 1. **只問隊伍名**——`events` schema 的 `results` 只有 `champion_team` 等欄位，
 *    站上任何一層都不得出現選手姓名／生日／聯絡方式（個資紅線）。既然是我們主動邀稿，
 *    就必須在範本裡先講清楚，而不是等收到個資再刪。
 * 2. **要求來源**——成績屬事實型資料，一律附得起來源才上站（鐵則 5：查不到就留白）。
 */
function resultsBody(pageUrl: string): string {
  return [
    `賽事頁：${pageUrl}`,
    '',
    '冠軍隊伍：',
    '亞軍隊伍：',
    '季軍隊伍：',
    '（只知道部分名次也可以，其餘留空即可）',
    '',
    '組別（如有分組，例如 20 級／40 級、國中組／高中組）：',
    '',
    '來源（頒獎照片、主辦單位公告網址、成績表，或您的身分與聯絡方式）：',
    '',
    '---',
    '⚠️ 請只填隊伍名稱。本站不收錄選手姓名、生日、聯絡方式等個人資料，',
    '若來信含個人資料，我們會在建檔時刪除。',
    '若您是主辦單位或參賽隊伍，請在此註明，我們會優先處理並標注來源。',
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

/** 產生預先填好賽事網址與成績欄位範本的 GitHub issue 連結。 */
export function resultsUrl({ path, title }: CorrectionTarget): string {
  const params = new URLSearchParams({
    labels: 'data-results',
    title: `提供成績：${title}`,
    body: resultsBody(`https://twdro.net${path}`),
  });
  return `${REPO_ISSUE_URL}?${params.toString()}`;
}

/**
 * 產生預先填好主旨與內文的成績提供 mailto 連結。
 *
 * 與 correctionMailto 同理不用 URLSearchParams：它把空白編成 '+'，
 * 在 mailto 的主旨與內文裡會原樣顯示成加號。
 */
export function resultsMailto({ path, title }: CorrectionTarget): string {
  const subject = encodeURIComponent(`提供成績：${title}`);
  const body = encodeURIComponent(resultsBody(`https://twdro.net${path}`));
  return `mailto:${CORRECTION_EMAIL}?subject=${subject}&body=${body}`;
}
