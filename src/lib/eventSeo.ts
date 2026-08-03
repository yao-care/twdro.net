/**
 * 賽事頁的 title／description 組裝。
 *
 * 為什麼要有這一支：賽事明細頁原本 title 只放主辦單位的正式全名
 * （如「第三屆臺灣教育科技盃無人機足球－新北地區公開賽」）、description 直接取選填的
 * subtitle（缺 subtitle 的頁就退回全站預設句）。但 GSC 實測顯示 events 是本站最會賺曝光的
 * 資產，而使用者搜的是**賽事名＋意圖＋年份**——「教育科技盃 成績」「天穹盃 報名」
 * 這類查詢，正式全名裡一個意圖詞都沒有。
 *
 * 故 title 依賽事生命週期補上當下最可能被搜的意圖詞，description 用實際欄位組出
 * 「日期／地點／報名截止／成績」的事實句。
 *
 * 鐵則 5（不得杜撰）：一律只用 YAML 裡實際存在的欄位，缺就省略，不補泛稱、不編數字。
 */
import { hasTeam, teamText, type TeamPlace } from './results';

/** 賽事狀態 → 該頁當下最該承接的搜尋意圖詞。有成績的已結束賽事優先掛「成績」。 */
export function eventIntent(status: string, hasResults = false): string {
  switch (status) {
    case 'registration_open': return '報名資訊';
    case 'announced': return '賽程與報名時間';
    case 'registration_closed': return '賽程資訊';
    case 'ongoing': return '賽程進行中';
    case 'results_pending': return '成績待確認';
    case 'cancelled': return '取消公告';
    case 'postponed': return '延期公告';
    case 'completed':
    case 'archived': return hasResults ? '成績與賽程' : '賽程資訊';
    default: return '賽程資訊';
  }
}

export interface EventSeoInput {
  title: string;
  subtitle?: string;
  status: string;
  rule_system?: string;
  schedule?: {
    event_start?: string;
    event_end?: string;
    registration_end?: string;
    venue_name?: string;
    city?: string;
    district?: string;
  };
  results?: {
    champion_team?: TeamPlace;
    runner_up_team?: TeamPlace;
    third_place_team?: TeamPlace;
    merit_teams?: string[];
    divisions?: {
      name: string;
      champion_team?: TeamPlace;
      runner_up_team?: TeamPlace;
      third_place_team?: TeamPlace;
      merit_teams?: string[];
    }[];
  };
}

// 分組別賽事的成績只填在 divisions 裡，頂層三欄是空的。若只看頂層，雙組別賽事會被判成
// 「沒有成績」→ title 掛「賽程資訊」而不是「成績」，並誤開徵稿入口。故一併認列 divisions。
const hasAnyResult = (r: EventSeoInput['results']): boolean =>
  !!r && !!(
    hasTeam(r.champion_team) || hasTeam(r.runner_up_team) || hasTeam(r.third_place_team)
    || r.divisions?.some((d) => hasTeam(d.champion_team) || hasTeam(d.runner_up_team) || hasTeam(d.third_place_team))
  );

/** 賽事頁 <title>：年份＋正式名＋意圖詞。年份已在名稱裡就不重複前綴。 */
export function eventPageTitle(d: EventSeoInput): string {
  const intent = eventIntent(d.status, hasAnyResult(d.results));
  const year = d.schedule?.event_start?.slice(0, 4);
  const prefix = year && !d.title.includes(year) ? `${year} ` : '';
  return `${prefix}${d.title}｜${intent}`;
}

/**
 * 賽事頁 meta description：由實際欄位組出事實句。
 * 順序刻意把「日期／地點」擺前面——那是區辨各場分站的關鍵字，也是使用者在搜的東西；
 * subtitle 是敘述性文案，擺後面且只在還有長度時附上。
 */
export function eventPageDescription(d: EventSeoInput, maxLen = 155): string {
  const s = d.schedule ?? {};
  const parts: string[] = [];

  const dateText = s.event_start
    ? (s.event_end && s.event_end !== s.event_start ? `${s.event_start}～${s.event_end}` : s.event_start)
    : null;
  const place = [s.venue_name, [s.city, s.district].filter(Boolean).join('')]
    .filter(Boolean).join('，');
  if (dateText && place) parts.push(`${dateText} 於 ${place} 舉行。`);
  else if (dateText) parts.push(`${dateText} 舉行。`);
  else if (place) parts.push(`地點：${place}。`);

  if (s.registration_end) parts.push(`報名至 ${s.registration_end}。`);
  // 冠軍是已結束賽事最高強度的查詢字，description 裡要看得到。分組別賽事沒有單一冠軍，
  // 改列各組冠軍（「國中組 X／國小組 Y」），仍受 maxLen 保護不會爆版。
  if (hasTeam(d.results?.champion_team)) {
    parts.push(`冠軍：${teamText(d.results?.champion_team)}。`);
  } else {
    const champs = (d.results?.divisions ?? [])
      .filter((x) => hasTeam(x.champion_team))
      .map((x) => `${x.name} ${teamText(x.champion_team)}`);
    if (champs.length) parts.push(`冠軍：${champs.join('／')}。`);
  }

  let out = parts.join('');
  // subtitle 只在還塞得下一整句時附上，避免被截成半句。
  if (d.subtitle && out.length + d.subtitle.length + 1 <= maxLen) {
    out = out ? `${out}${d.subtitle}。` : `${d.subtitle}。`;
  }
  // 一個欄位都沒有（極少見）＝交還給 BaseLayout 的預設句，不硬湊。
  return out || '';
}
