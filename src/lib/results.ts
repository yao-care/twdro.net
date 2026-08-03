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
