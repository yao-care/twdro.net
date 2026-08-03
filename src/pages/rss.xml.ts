// /rss.xml — 賽事與公告的更新來源，build 時自動生成。
//
// 收錄兩種東西：`news`（本站整理的公告摘要）與 `events`（賽事）。賽事的 pubDate 取
// 各來源 `retrieved_at` 的最大值——那是「我方最後確認這筆資料」的日期，與 sitemap
// lastmod 同一套語意（見 src/lib/lastmod.mjs），不用建置時間，也不用未來的賽期。
//
// 摘要裡刻意寫出狀態與「已公布成績／成績尚未公布」：訂閱這份的人要等的就是這兩件事，
// 只給標題等於逼他們每筆都點進來看。

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { isPublicEvent, eventStatusLabel } from '../lib/enums';
import { hasTeam } from '../lib/results';
import { xmlEscape, rfc822, isDate } from '../lib/feed';

const SITE = 'https://twdro.net';
const MAX_ITEMS = 60;

type Item = { title: string; link: string; guid: string; date: string; description: string };

export const GET: APIRoute = async () => {
  const items: Item[] = [];

  for (const n of await getCollection('news')) {
    items.push({
      title: n.data.title,
      // news 沒有明細頁，正文本來就在外部；錨點連到索引頁上的那一則。
      link: `${SITE}/news/#${n.id}`,
      guid: `${SITE}/news/#${n.id}`,
      date: isDate(n.data.date) ? n.data.date : '',
      description: n.data.summary ?? n.data.title,
    });
  }

  for (const e of await getCollection('events')) {
    if (!isPublicEvent(e.data.status)) continue;   // 草稿不對外，與各頁面一致
    const d = e.data;
    const retrieved = d.sources
      .map((s) => s.retrieved_at)
      .filter(isDate)
      .sort()
      .at(-1);

    const r = d.results;
    const hasResults = !!r && (hasTeam(r.champion_team) || hasTeam(r.runner_up_team)
      || hasTeam(r.third_place_team)
      || !!r.divisions?.some((x) => hasTeam(x.champion_team) || hasTeam(x.runner_up_team)
        || hasTeam(x.third_place_team)));

    const parts = [`狀態：${eventStatusLabel(d.status)}`];
    if (d.schedule.event_start) {
      const end = d.schedule.event_end && d.schedule.event_end !== d.schedule.event_start
        ? `～${d.schedule.event_end}` : '';
      parts.push(`日期：${d.schedule.event_start}${end}`);
    }
    const place = [d.schedule.city, d.schedule.venue_name].filter(Boolean).join(' ');
    if (place) parts.push(`地點：${place}`);
    if (d.schedule.registration_end) parts.push(`報名截止：${d.schedule.registration_end}`);
    parts.push(hasResults ? '已公布成績' : '成績尚未公布');

    items.push({
      title: d.title,
      link: `${SITE}/events/${e.id}/`,
      guid: `${SITE}/events/${e.id}/`,
      date: retrieved ?? (isDate(d.schedule.event_start) ? d.schedule.event_start : ''),
      description: parts.join('｜'),
    });
  }

  // 有日期的在前、日期新的在前；沒有日期的排最後（不編一個假日期給它）。
  items.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const latest = items.find((i) => i.date)?.date;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    '<title>twdro.net｜臺灣無人機足球賽事與公告</title>',
    `<link>${SITE}/</link>`,
    '<description>臺灣無人機足球的賽事動態、報名時程、成績公布與站上公告。每一筆資料都標明來源與查核日期。</description>',
    '<language>zh-Hant</language>',
    `<atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />`,
    latest ? `<lastBuildDate>${rfc822(latest)}</lastBuildDate>` : '',
    ...items.slice(0, MAX_ITEMS).map((i) => [
      '<item>',
      `<title>${xmlEscape(i.title)}</title>`,
      `<link>${xmlEscape(i.link)}</link>`,
      `<guid isPermaLink="false">${xmlEscape(i.guid)}</guid>`,
      i.date ? `<pubDate>${rfc822(i.date)}</pubDate>` : '',
      `<description>${xmlEscape(i.description)}</description>`,
      '</item>',
    ].filter(Boolean).join('\n')),
    '</channel>',
    '</rss>',
  ].filter(Boolean).join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
