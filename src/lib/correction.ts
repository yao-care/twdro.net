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

export interface CorrectionTarget {
  /** 資料頁路徑，如 /events/2026-skycup-tainan/ */
  path: string;
  /** 該頁標題，用於 issue 標題 */
  title: string;
}

/** 產生預先填好頁面網址與欄位範本的 GitHub issue 連結。 */
export function correctionUrl({ path, title }: CorrectionTarget): string {
  const pageUrl = `https://twdro.net${path}`;
  const body = [
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

  const params = new URLSearchParams({
    labels: 'data-correction',
    title: `資料更正：${title}`,
    body,
  });
  return `${REPO_ISSUE_URL}?${params.toString()}`;
}
