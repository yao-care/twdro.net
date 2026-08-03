import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { xmlEscape, rfc822, icsEscape, icsFold, icsDate, icsDatePlusDays, isDate } from '../src/lib/feed';

// 為什麼有這組測試（2026-08-03）：
//
// RSS 與 .ics 是本站唯一的「回訪機制」——讀者看過報名截止日之後，只有訂閱才會被叫回來。
// 這兩份檔的壞法都是無聲的：折錯行或少一個 CRLF 的 .ics 在日曆軟體會整份匯入失敗，
// 沒跳脫的 XML 會讓閱讀器直接放棄整個 feed，但**檔案照樣產生、build 照樣過、畫面看不出來**，
// 只有真的拿去訂閱的人才知道。跟 sitemap lastmod 當初一樣，所以釘在建置產物層。

describe('feed 編碼工具', () => {
  it('XML 跳脫五個字元', () => {
    expect(xmlEscape(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('RFC 822 日期標 +0800，星期正確', () => {
    // 2026-08-01 是星期六
    expect(rfc822('2026-08-01')).toBe('Sat, 01 Aug 2026 00:00:00 +0800');
    expect(rfc822('2025-11-09')).toBe('Sun, 09 Nov 2025 00:00:00 +0800');
  });

  it('iCalendar 跳脫反斜線、分號、逗號與換行', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('全天事件的 DTEND 排他，且跨月跨年正確', () => {
    expect(icsDate('2026-08-01')).toBe('20260801');
    expect(icsDatePlusDays('2026-08-02', 1)).toBe('20260803');
    expect(icsDatePlusDays('2026-08-31', 1)).toBe('20260901');
    expect(icsDatePlusDays('2026-12-31', 1)).toBe('20270101');
  });

  it('折行按位元組算，且不把中文字剖成兩半', () => {
    const line = 'SUMMARY:' + '臺灣無人機足球錦標賽全國總決賽'.repeat(6);
    const folded = icsFold(line);
    const enc = new TextEncoder();
    for (const l of folded.split('\r\n')) {
      expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    }
    // 攤平（去掉 CRLF 與續行的前導空格）必須還原成原字串——若切在多位元組字中間，
    // 這裡會出現替換字元 U+FFFD 而還原失敗。
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(line);
    expect(folded).not.toContain('�');
    // 續行一律以一個空格開頭
    for (const l of folded.split('\r\n').slice(1)) expect(l.startsWith(' ')).toBe(true);
  });

  it('短行不折', () => {
    expect(icsFold('VERSION:2.0')).toBe('VERSION:2.0');
  });

  it('isDate 只認 YYYY-MM-DD', () => {
    expect(isDate('2026-08-03')).toBe(true);
    expect(isDate('2026/08/03')).toBe(false);
    expect(isDate(undefined)).toBe(false);
  });
});

// 以下需先執行 `npm run build`
const RSS = 'dist/rss.xml';
const ICS = 'dist/events/calendar.ics';

// 公開賽事（非草稿）的檔案清單——不引入 YAML 套件，只做與 lastmod.mjs 同層級的字串判讀。
const eventFiles = readdirSync('src/content/events')
  .filter((f) => f.endsWith('.yml'))
  .map((f) => readFileSync(`src/content/events/${f}`, 'utf8'))
  .filter((t) => !/^status:\s*draft\s*$/m.test(t));

describe('/rss.xml', () => {
  it('有產出', () => { expect(existsSync(RSS)).toBe(true); });

  const xml = existsSync(RSS) ? readFileSync(RSS, 'utf8') : '';

  it('是 RSS 2.0 且宣告 self 連結', () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://twdro.net/rss.xml" rel="self"');
  });

  it('每一場公開賽事都在 feed 裡', () => {
    const items = xml.match(/<item>/g)?.length ?? 0;
    expect(items).toBeGreaterThanOrEqual(eventFiles.length);
  });

  it('每個項目都有標題、連結與 guid', () => {
    const items = xml.split('<item>').slice(1);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it).toMatch(/<title>.+<\/title>/);
      expect(it).toMatch(/<link>https:\/\/twdro\.net\/.+<\/link>/);
      expect(it).toMatch(/<guid isPermaLink="false">.+<\/guid>/);
    }
  });

  it('摘要寫明成績狀態——訂閱者等的就是這件事', () => {
    expect(xml).toMatch(/已公布成績|成績尚未公布/);
  });

  it('沒有未跳脫的裸 & （閱讀器會整份放棄）', () => {
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  });

  it('全站 head 宣告 feed，閱讀器才發現得到', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toContain('type="application/rss+xml"');
    expect(html).toContain('/rss.xml');
  });
});

describe('/events/calendar.ics', () => {
  it('有產出', () => { expect(existsSync(ICS)).toBe(true); });

  const ics = existsSync(ICS) ? readFileSync(ICS, 'utf8') : '';

  it('行尾一律 CRLF，含最後一行', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // 不得有落單的 LF（即沒有 CR 在前的換行）
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
  });

  it('外框完整', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:');
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(ics.match(/END:VEVENT/g)?.length);
  });

  it('每一行都在 75 位元組以內', () => {
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('每個 VEVENT 都有 UID／DTSTAMP／DTSTART／SUMMARY', () => {
    const blocks = ics.split('BEGIN:VEVENT').slice(1);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const block = b.split('END:VEVENT')[0];
      expect(block).toMatch(/\r\nUID:[^\r\n]+@twdro\.net/);
      expect(block).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z/);
      expect(block).toMatch(/\r\nDTSTART;VALUE=DATE:\d{8}/);
      expect(block).toMatch(/\r\nSUMMARY:/);
    }
  });

  it('有賽期的賽事都上了日曆', () => {
    const withStart = eventFiles.filter((t) => /event_start:\s*"\d{4}-\d{2}-\d{2}"/.test(t)).length;
    const eventBlocks = ics.match(/UID:event-/g)?.length ?? 0;
    expect(eventBlocks).toBe(withStart);
  });

  it('有報名截止日的賽事另外產出一筆提醒——這是訂閱的主要理由', () => {
    const withDeadline = eventFiles.filter((t) => /registration_end:\s*"\d{4}-\d{2}-\d{2}"/.test(t)).length;
    const regBlocks = ics.match(/UID:registration-/g)?.length ?? 0;
    expect(regBlocks).toBe(withDeadline);
    expect(regBlocks).toBeGreaterThan(0);
  });

  it('草稿不上日曆', () => {
    expect(ics).not.toContain('status: draft');
    const drafts = readdirSync('src/content/events')
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => /^status:\s*draft\s*$/m.test(readFileSync(`src/content/events/${f}`, 'utf8')))
      .map((f) => f.replace(/\.yml$/, ''));
    for (const id of drafts) expect(ics).not.toContain(`UID:event-${id}@`);
  });
});
