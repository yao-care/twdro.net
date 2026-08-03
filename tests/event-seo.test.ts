import { describe, it, expect } from 'vitest';
import { eventIntent, eventPageTitle, eventPageDescription } from '../src/lib/eventSeo';

describe('eventSeo：賽事頁 title／description', () => {
  it('意圖詞跟著賽事生命週期走', () => {
    expect(eventIntent('registration_open')).toBe('報名資訊');
    expect(eventIntent('announced')).toBe('賽程與報名時間');
    expect(eventIntent('ongoing')).toBe('賽程進行中');
    expect(eventIntent('results_pending')).toBe('成績待確認');
    expect(eventIntent('cancelled')).toBe('取消公告');
  });

  // 已結束賽事的搜尋意圖是「成績」，但沒有成績資料就不能掛這個詞（鐵則 5）。
  it('已結束賽事只有真的有成績才掛「成績」', () => {
    expect(eventIntent('completed', true)).toBe('成績與賽程');
    expect(eventIntent('completed', false)).toBe('賽程資訊');
  });

  it('title 補上年份與意圖詞', () => {
    const t = eventPageTitle({
      title: '第三屆臺灣教育科技盃無人機足球－新北地區公開賽',
      status: 'announced',
      schedule: { event_start: '2026-08-08' },
    });
    expect(t).toBe('2026 第三屆臺灣教育科技盃無人機足球－新北地區公開賽｜賽程與報名時間');
  });

  it('名稱已含年份就不重複前綴', () => {
    const t = eventPageTitle({
      title: '2026 天穹盃台北戰',
      status: 'registration_open',
      schedule: { event_start: '2026-09-01' },
    });
    expect(t).toBe('2026 天穹盃台北戰｜報名資訊');
  });

  it('沒有日期欄位就不硬湊年份', () => {
    expect(eventPageTitle({ title: '某盃賽', status: 'announced' })).toBe('某盃賽｜賽程與報名時間');
  });

  it('description 由實際欄位組出日期與地點', () => {
    const d = eventPageDescription({
      title: 'x', status: 'announced',
      schedule: {
        event_start: '2026-08-08', venue_name: '新北市立三民高中 逸仙堂',
        city: '新北市', district: '蘆洲區', registration_end: '2026-07-31',
      },
    });
    expect(d).toContain('2026-08-08 於 新北市立三民高中 逸仙堂，新北市蘆洲區 舉行。');
    expect(d).toContain('報名至 2026-07-31。');
  });

  it('起訖不同日印區間，相同日只印一次', () => {
    const range = eventPageDescription({ title: 'x', status: 'announced', schedule: { event_start: '2026-08-08', event_end: '2026-08-09' } });
    expect(range).toContain('2026-08-08～2026-08-09');
    const same = eventPageDescription({ title: 'x', status: 'announced', schedule: { event_start: '2026-08-08', event_end: '2026-08-08' } });
    expect(same).toContain('2026-08-08 舉行。');
    expect(same).not.toContain('～');
  });

  it('有成績就把冠軍寫進 description', () => {
    const d = eventPageDescription({
      title: 'x', status: 'completed',
      schedule: { event_start: '2025-11-01' },
      results: { champion_team: '某高中甲隊' },
    });
    expect(d).toContain('冠軍：某高中甲隊。');
  });

  // 鐵則 5：缺欄位一律留白，不得補「臺灣」這類泛稱或編造數字。
  // 2026-08-03 加：縣市選拔賽多為國中組／國小組雙組別，成績只填在 results.divisions，
  // 頂層 champion_team 是空的。若判定只看頂層，這種賽事會被當成「沒有成績」→ title 掛
  // 「賽程資訊」而不是「成績」，並誤開成績徵稿入口。首例＝嘉義縣 115 年度選拔賽。
  it('分組別成績也算有成績，title 要掛「成績」', () => {
    const d = {
      title: '嘉義縣 115 年度無人機足球競賽',
      status: 'completed',
      schedule: { event_start: '2026-05-28' },
      results: {
        divisions: [
          { name: '國中組', champion_team: '永慶高中（國中部）', runner_up_team: '布袋國中' },
          { name: '國小組', champion_team: '蒜頭國小', runner_up_team: '景山國小' },
        ],
      },
    };
    expect(eventPageTitle(d)).toContain('成績與賽程');
    expect(eventPageDescription(d)).toContain('冠軍：國中組 永慶高中（國中部）／國小組 蒜頭國小。');
  });

  it('分組別但各組都沒填冠亞季，仍視為沒有成績', () => {
    const d = {
      title: '某縣市選拔賽',
      status: 'completed',
      schedule: { event_start: '2026-05-28' },
      results: { divisions: [{ name: '國小組' }] },
    };
    expect(eventPageTitle(d)).toContain('賽程資訊');
  });

  it('什麼欄位都沒有時回空字串，交還給 BaseLayout 預設句', () => {
    expect(eventPageDescription({ title: 'x', status: 'announced' })).toBe('');
  });

  it('subtitle 塞不下就整句捨棄，不留半句', () => {
    const long = '這是一段很長的副標題'.repeat(20);
    const d = eventPageDescription({
      title: 'x', status: 'announced', subtitle: long,
      schedule: { event_start: '2026-08-08' },
    });
    expect(d).toBe('2026-08-08 舉行。');
    expect(d).not.toContain('這是一段');
  });

  it('description 不超過長度上限', () => {
    const d = eventPageDescription({
      title: 'x', status: 'completed', subtitle: '新增無刷馬達組，賽制參考 FAI／FIDA 國際規範',
      schedule: {
        event_start: '2026-08-08', event_end: '2026-08-09', venue_name: '新北市立三民高中 逸仙堂',
        city: '新北市', district: '蘆洲區', registration_end: '2026-07-31',
      },
      results: { champion_team: '某高中甲隊' },
    });
    expect(d.length).toBeLessThanOrEqual(155);
  });
});

describe('並列名次與優勝', () => {
  // 2026-08-03：新竹縣第一屆教育科技盃第二名 2 隊、第三名 3 隊，主辦官網明寫「2組」「3組」。
  // 名次欄位因此可為陣列；判定「有沒有成績」不能直接看 truthy——空陣列是 truthy。
  it('陣列名次算有成績，空陣列不算', () => {
    const withTies = eventPageTitle({
      title: 'X盃', status: 'completed',
      results: { runner_up_team: ['甲隊', '乙隊'] },
    } as any);
    expect(withTies).toContain('成績');

    const emptyArrays = eventPageTitle({
      title: 'X盃', status: 'completed',
      results: { champion_team: [], runner_up_team: [], third_place_team: [] },
    } as any);
    expect(emptyArrays).toContain('賽程資訊');
    expect(emptyArrays).not.toContain('成績');
  });

  it('description 的冠軍並列以頓號相連，不是逗號或陣列字面值', () => {
    const d = eventPageDescription({
      title: 'X盃', status: 'completed',
      results: { champion_team: ['甲隊', '乙隊'] },
    } as any);
    expect(d).toContain('冠軍：甲隊、乙隊');
    expect(d).not.toContain('甲隊,乙隊');
  });
});
