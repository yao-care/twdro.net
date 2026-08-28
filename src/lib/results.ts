/**
 * 賽事名次的正規化。
 *
 * 名次欄位可能是單一隊伍（字串）或並列多隊（陣列）——新竹縣第一屆教育科技盃就是
 * 第二名 2 隊、第三名 3 隊。讀取端一律經過這裡，不要各自 `Array.isArray` 判斷，
 * 否則某一頁忘了處理陣列就會印出 "A,B" 這種逗號串。
 */
export type TeamPlace = string | string[] | undefined;

/** 轉成陣列；空值與空字串一律回空陣列（空陣列是 falsy 判斷的依據）。 */
export function teamList(v: TeamPlace): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((s) => s.trim()).filter(Boolean);
}

/** 顯示用字串。並列以頓號分隔，符合中文名次並列的寫法。 */
export function teamText(v: TeamPlace): string {
  return teamList(v).join('、');
}

/** 這一組名次有沒有任何隊伍。空陣列不算——注意 `[]` 本身是 truthy。 */
export function hasTeam(v: TeamPlace): boolean {
  return teamList(v).length > 0;
}

/**
 * 「這場算不算已經結束」——成績相關的判斷一律以 status 為準，不看日期。
 * 日期會過，status 是人工／pipeline 維護的事實欄位（同 /events/ 索引的分組原則）。
 */
export const FINISHED_STATUSES = ['completed', 'results_pending', 'archived'] as const;

export interface ResultBlock {
  champion_team?: TeamPlace;
  runner_up_team?: TeamPlace;
  third_place_team?: TeamPlace;
  fourth_place_team?: TeamPlace;
  merit_teams?: string[];
  divisions?: ResultBlock[];
  name?: string;
}

/** 這一組（頂層或單一組別）有沒有任何名次資料。 */
export function hasAnyPlace(r?: ResultBlock): boolean {
  if (!r) return false;
  return hasTeam(r.champion_team) || hasTeam(r.runner_up_team)
    || hasTeam(r.third_place_team) || hasTeam(r.fourth_place_team)
    || (r.merit_teams?.length ?? 0) > 0;
}

/** 真的有名次可列的組別（空組別不算，否則畫面會出現只有標題的空區塊）。 */
export function publishedDivisions(r?: ResultBlock): ResultBlock[] {
  return (r?.divisions ?? []).filter(hasAnyPlace);
}

/** 這場賽事有沒有可公開的成績（頂層或任一組別）。 */
export function hasPublishedResults(r?: ResultBlock): boolean {
  return hasAnyPlace(r) || publishedDivisions(r).length > 0;
}

/**
 * 已結束、但成績還查不到——站上最大的資料缺口。
 * 2026-08-27 抽成共用函式：這段判斷原本只寫在 events/[slug].astro，而 /events/results/
 * 需要用同一條線把「已公布」與「等公布」分開。兩邊各寫一次必然走鐘，
 * 走鐘的樣子還特別難發現：某一頁把「等公布」誤判成「沒有成績」就整場消失，
 * 而消失的頁面沒有人會注意到。
 */
export function awaitsResults(status: string, r?: ResultBlock): boolean {
  return !hasPublishedResults(r) && (FINISHED_STATUSES as readonly string[]).includes(status);
}
