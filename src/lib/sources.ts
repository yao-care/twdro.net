// 資料來源的呈現分組。
//
// 為什麼分組（2026-07-29）：同一則報導常被多家媒體轉載，標題一字不差。逐筆平鋪會把
// 同一個標題印兩次，看起來像重複貼了同一個連結——實際上那是兩個獨立來源在互相佐證，
// 是這筆資料可信度的主要依據。改成「標題印一次，各家發布單位各佔一行」，讓畫面直接
// 讀得出「這件事有幾家報過」。
//
// 分類字（新聞報導／廠商資料／教育部公告）不再單獨印：publisher 已經說得更準
// ——「中央社」「教育部」「奧斯丁國際有限公司」本身就表明了那是什麼性質的來源。
// 只有在沒有標題、publisher 得單獨挑大樑時才補上分類字。

export interface SourceItem {
  type: string;
  url: string;
  title?: string;
  publisher?: string;
  published_at?: string;
  retrieved_at?: string;
  trust_level: string;
}

export interface SourceGroup {
  /** 共同標題；來源沒填 title 時為 null，呈現層改讓 publisher 當主行 */
  title: string | null;
  items: SourceItem[];
}

/** 從網址取可讀的網域名，當 publisher 缺漏時的退路。 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 該筆來源在畫面上的署名。 */
export function bylineOf(s: SourceItem): string {
  return s.publisher ?? hostOf(s.url);
}

/**
 * 依標題分組，保留原本的出現順序。
 * 沒有標題的來源各自成組（title: null），不會被併在一起——它們只是剛好都缺標題，
 * 不代表講的是同一件事。
 */
export function groupSources(sources: SourceItem[]): SourceGroup[] {
  const groups: SourceGroup[] = [];
  const byTitle = new Map<string, SourceGroup>();

  for (const s of sources) {
    if (!s.title) {
      groups.push({ title: null, items: [s] });
      continue;
    }
    const existing = byTitle.get(s.title);
    if (existing) {
      existing.items.push(s);
      continue;
    }
    const group: SourceGroup = { title: s.title, items: [s] };
    byTitle.set(s.title, group);
    groups.push(group);
  }

  return groups;
}
