// /events/calendar.ics — 賽事行事曆訂閱檔（RFC 5545），build 時自動生成。
//
// 每場賽事產出兩種 VEVENT：
//   1. 賽期本身（全天事件，跨日賽事 DTEND 排他 +1 天）
//   2. **報名截止日**（有 registration_end 才產）——這是訂閱這份檔的主要理由。
//      家長與教師要的不是「知道有這場比賽」，是「別錯過報名」。
//
// UID 用 `<種類>-<slug>@twdro.net`，跨次建置穩定：日曆軟體靠 UID 判斷是同一筆更新
// 還是新的一筆，若每次 build 都變，訂閱者的日曆會不斷長出重複事件。
//
// 折行與跳脫規則見 src/lib/feed.ts；那部分寫錯時檔案照樣產生、build 照樣過，
// 只有真的拿去匯入的人才會發現，所以 tests/feeds.test.ts 逐條釘住。

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { isPublicEvent, eventStatusLabel } from '../../lib/enums';
import { icsEscape, icsDate, icsDatePlusDays, icsLines, isDate } from '../../lib/feed';

const SITE = 'https://twdro.net';

export const GET: APIRoute = async () => {
  const events = (await getCollection('events'))
    .filter((e) => isPublicEvent(e.data.status))   // 草稿不上日曆，與 /events/calendar/ 一致
    .sort((a, b) => (a.data.schedule.event_start ?? '').localeCompare(b.data.schedule.event_start ?? ''));

  // DTSTAMP＝這份檔何時產生，是 RFC 5545 的必填欄位，語意就是建置時間
  // （與 sitemap lastmod 不同，這裡不是在對搜尋引擎宣稱內容有更新）。
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//twdro.net//臺灣無人機足球賽事//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:臺灣無人機足球賽事',
    'X-WR-CALDESC:臺灣無人機足球（無人機飛球）的賽期與報名截止日。資料來源見 https://twdro.net/events/',
    'X-WR-TIMEZONE:Asia/Taipei',
  ];

  for (const e of events) {
    const d = e.data;
    const url = `${SITE}/events/${e.id}/`;
    const place = [d.schedule.city, d.schedule.venue_name].filter(Boolean).join(' ');
    const cancelled = d.status === 'cancelled';

    const desc = [
      `狀態：${eventStatusLabel(d.status)}`,
      d.organizer ? `主辦：${d.organizer}` : '',
      d.schedule.registration_end ? `報名截止：${d.schedule.registration_end}` : '',
      `賽事頁（含來源與查核日期）：${url}`,
    ].filter(Boolean).join('\n');

    if (isDate(d.schedule.event_start)) {
      const end = isDate(d.schedule.event_end) ? d.schedule.event_end : d.schedule.event_start;
      lines.push(
        'BEGIN:VEVENT',
        `UID:event-${e.id}@twdro.net`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d.schedule.event_start)}`,
        `DTEND;VALUE=DATE:${icsDatePlusDays(end, 1)}`,
        `SUMMARY:${icsEscape(d.title)}`,
        ...(place ? [`LOCATION:${icsEscape(place)}`] : []),
        `DESCRIPTION:${icsEscape(desc)}`,
        `URL:${url}`,
        `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
        'END:VEVENT',
      );
    }

    if (isDate(d.schedule.registration_end)) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:registration-${e.id}@twdro.net`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d.schedule.registration_end)}`,
        `DTEND;VALUE=DATE:${icsDatePlusDays(d.schedule.registration_end, 1)}`,
        `SUMMARY:${icsEscape(`報名截止：${d.title}`)}`,
        `DESCRIPTION:${icsEscape(`報名期限以主辦單位公告為準。賽事頁：${url}`)}`,
        `URL:${url}`,
        `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');

  return new Response(icsLines(lines), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
