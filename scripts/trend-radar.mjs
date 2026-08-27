#!/usr/bin/env node
/**
 * 外部搜尋趨勢雷達。
 *
 * 這支程式只產生 seo-data/trends/YYYY-MM-DD.json，不改事實型 YAML，也不直接發佈文章。
 * 它把三種訊號拆開留痕：Google Trends Trending Now、Google 建議字、Bing 建議字。
 * Trending Now 目前可能對臺灣回報 unsupported，因此不能把它當唯一資料源；
 * 自動發布候選必須同時有 Google／Bing 建議字、站內已驗證且即將發生的賽事，並能追溯來源。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const EVENT_DIR = join(ROOT, 'src/content/events');
const LEARN_DIR = join(ROOT, 'src/content/learn');
const TREND_DIR = join(ROOT, 'seo-data/trends');
const TREND_RSS_URL = 'https://trends.google.com/trending/rss?geo=TW';
const GOOGLE_SUGGEST_URL = (query) =>
  `https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-TW&q=${encodeURIComponent(query)}`;
const BING_SUGGEST_URL = (query) =>
  `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}&mkt=zh-TW`;
const AUTOCOMPLETE_TIMEOUT_MS = 8000;
const TREND_TIMEOUT_MS = 10000;
const UPCOMING_WINDOW_DAYS = 21;

const SEEDS = [
  '無人機足球',
  '無人機飛球',
  '天穹盃',
  '臺灣教育科技盃',
  '教育部 無人機足球競賽',
  '總統盃 無人機競賽',
];

const unquote = (value) => value
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .trim();

const field = (raw, key, indented = false) => {
  const prefix = indented ? '^\\s+' : '^';
  const match = raw.match(new RegExp(`${prefix}${key}:\\s*(.*)$`, 'm'));
  return match ? unquote(match[1]) : '';
};

const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase('zh-Hant-TW')
  .replace(/[\s　「」『』（）()·、，。,:：!?！？/_-]/g, '');

const stripCitySuffix = (value) => String(value ?? '').replace(/[市縣]$/, '');

const dateInTaipei = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const dateArg = () => {
  const exact = process.argv.find((arg) => arg.startsWith('--date='));
  const next = process.argv.indexOf('--date');
  return exact?.slice('--date='.length) ?? (next >= 0 ? process.argv[next + 1] : null) ?? dateInTaipei();
};

const dateDistance = (from, to) => {
  const start = Date.parse(`${from}T00:00:00+08:00`);
  const end = Date.parse(`${to}T00:00:00+08:00`);
  return Math.round((end - start) / 86400000);
};

const xmlText = (value) => String(value ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();

const xmlTag = (raw, tag) => xmlText(raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]);

const fetchText = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'twdro.net trend radar/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

export const parseSuggestions = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.[1]) ? parsed[1].filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const parseTrendingRss = (raw) => [...String(raw ?? '').matchAll(/<item>([\s\S]*?)<\/item>/gi)]
  .map((match) => {
    const item = match[1];
    return {
      title: xmlTag(item, 'title'),
      traffic: xmlTag(item, 'ht:approx_traffic'),
      pubDate: xmlTag(item, 'pubDate'),
      source: xmlTag(item, 'ht:news_item_source'),
      newsUrl: xmlTag(item, 'ht:news_item_url'),
    };
  })
  .filter((item) => item.title);

const parseEvents = () => readdirSync(EVENT_DIR)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => {
    const slug = basename(name, '.yml');
    const raw = readFileSync(join(EVENT_DIR, name), 'utf8');
    const sources = [...raw.matchAll(/^\s+url:\s*(.*)$/gm)].map((match) => unquote(match[1]));
    return {
      slug,
      title: field(raw, 'title'),
      eventSeries: field(raw, 'event_series'),
      status: field(raw, 'status'),
      verification: field(raw, 'verification'),
      eventStart: field(raw, 'event_start', true),
      city: field(raw, 'city', true),
      venueName: field(raw, 'venue_name', true),
      subtitle: field(raw, 'subtitle'),
      sourceUrls: sources.filter((url) => /^https?:\/\//.test(url)),
    };
  })
  .filter((event) => event.title && event.eventStart);

const existingTrendIds = () => {
  if (!existsSync(LEARN_DIR)) return new Set();
  const tracked = new Set(execSync('git ls-files -- src/content/learn/', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean));
  return new Set(readdirSync(LEARN_DIR)
    .filter((name) => name.endsWith('.md'))
    // 新文章在 brain 尚未 commit 前不算「已覆蓋」，否則重新跑 radar 會把本輪候選誤判成 refresh。
    .filter((name) => tracked.has(`src/content/learn/${name}`))
    .map((name) => readFileSync(join(LEARN_DIR, name), 'utf8').match(/^trend_id:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1])
    .filter(Boolean));
};

const matchingHits = (suggestions, terms) => {
  const normalizedTerms = terms.map(normalize).filter((term) => term.length >= 2);
  return suggestions.filter((suggestion) => {
    const candidate = normalize(suggestion);
    return normalizedTerms.some((term) => candidate.includes(term));
  });
};

export const scoreCandidate = ({ googleHits, bingHits, upcomingDays, verified, sourceCount }) => {
  let score = 0;
  if (googleHits >= 2) score += 2;
  else if (googleHits === 1) score += 1;
  if (bingHits >= 2) score += 2;
  else if (bingHits === 1) score += 1;
  if (googleHits >= 1 && bingHits >= 1) score += 2;
  if (upcomingDays >= 0 && upcomingDays <= UPCOMING_WINDOW_DAYS) score += 2;
  if (verified) score += 1;
  if (sourceCount >= 2) score += 1;
  return Math.min(score, 10);
};

const querySuggestions = async (query, warnings) => {
  const result = { query, google: [], bing: [], available: { google: false, bing: false }, urls: {
    google: GOOGLE_SUGGEST_URL(query),
    bing: BING_SUGGEST_URL(query),
  } };
  const responses = await Promise.allSettled([
    fetchText(result.urls.google, AUTOCOMPLETE_TIMEOUT_MS),
    fetchText(result.urls.bing, AUTOCOMPLETE_TIMEOUT_MS),
  ]);
  // ⚠️ 「抓不到」與「抓到但沒有建議字」必須分開記（2026-08-27）。原本兩者都留下空陣列，
  // 於是 googleHits 永遠是 0——而 Google Suggest 對本主機的資料中心 IP 一律回 403
  // （四個端點實測皆同：complete/search 的 firefox／chrome／gws-wiz／toolbar）。
  // 結果是 `enoughSearchSignals` 要求雙引擎各 ≥2、而 score 門檻 7 分裡有 4 分只有
  // Google 拿得到，兩道都變成永遠不可能通過：2026-08-17 建立這條產線起，
  // 它一次都沒有、也不可能發出任何文章，而每天的輸出看起來只是「訊號未達門檻」。
  if (responses[0].status === 'fulfilled') { result.google = parseSuggestions(responses[0].value); result.available.google = true; }
  else warnings.push(`Google 建議字「${query}」抓取失敗：${responses[0].reason?.message ?? 'unknown error'}`);
  if (responses[1].status === 'fulfilled') { result.bing = parseSuggestions(responses[1].value); result.available.bing = true; }
  else warnings.push(`Bing 建議字「${query}」抓取失敗：${responses[1].reason?.message ?? 'unknown error'}`);
  return result;
};

/**
 * 需求訊號的通過條件。分開成一個函式，是因為「幾個引擎在線」會同時改變門檻與判準，
 * 寫在 buildCandidate 裡會看不出降級發生過。
 *
 * - 兩個引擎都在：維持原判準（各 ≥2 個相關建議字、score ≥ 7）。
 * - 只剩一個引擎：**降級但要說出來**。門檻降到 5（另一個引擎的 2 分與交叉比對的 2 分
 *   本來就拿不到，不降就是假門檻），同時把在線引擎的要求從 ≥2 提高到 ≥3——
 *   少了交叉佐證，就該對僅存的訊號要求更嚴，而不是照原樣放行。
 * - 兩個都不在：不發布。沒有需求訊號時不能靠賽事資料自己就上稿。
 */
export const signalGate = ({ googleHits, bingHits, googleAvailable, bingAvailable, score }) => {
  const online = [googleAvailable && 'google', bingAvailable && 'bing'].filter(Boolean);
  if (online.length === 0) {
    return { enough: false, threshold: Infinity, degraded: true, note: '兩個建議字引擎都抓不到，本輪不發布。' };
  }
  if (online.length === 1) {
    const hits = googleAvailable ? googleHits : bingHits;
    const offline = googleAvailable ? 'Bing' : 'Google';   // 在線的是 google ⇒ 掉線的是 bing
    return {
      enough: hits >= 3,
      threshold: 5,
      degraded: true,
      note: `⚠️ ${offline} 建議字不可用，雙引擎交叉比對已降級為單引擎：門檻 5 分、`
        + `在線引擎需 ≥3 個相關建議字（本輪 ${hits} 個）。這一輪的需求訊號沒有第二個來源佐證。`,
    };
  }
  return { enough: googleHits >= 2 && bingHits >= 2, threshold: 7, degraded: false, note: '' };
};

const buildCandidate = (event, signal, runDate, knownTrendIds) => {
  const city = stripCitySuffix(event.city);
  const terms = [event.eventSeries, city, '無人機足球', '無人機飛球'].filter(Boolean);
  const googleHits = matchingHits(signal.google, terms);
  const bingHits = matchingHits(signal.bing, terms);
  const upcomingDays = dateDistance(runDate, event.eventStart);
  const sourceUrls = [
    `https://twdro.net/events/${event.slug}/`,
    ...event.sourceUrls,
  ].filter((url, index, all) => url && all.indexOf(url) === index);
  const dateParts = event.eventStart.split('-');
  const dateDisplay = dateParts.length === 3
    ? `${dateParts[0]} 年 ${Number(dateParts[1])} 月 ${Number(dateParts[2])} 日`
    : event.eventStart;
  const verified = ['source_confirmed', 'organizer_verified', 'official'].includes(event.verification);
  const id = `trend-${event.slug}`;
  const score = scoreCandidate({
    googleHits: googleHits.length,
    bingHits: bingHits.length,
    upcomingDays,
    verified,
    sourceCount: sourceUrls.length,
  });
  const gate = signalGate({
    googleHits: googleHits.length,
    bingHits: bingHits.length,
    googleAvailable: signal.available?.google ?? false,
    bingAvailable: signal.available?.bing ?? false,
    score,
  });
  const publishable = score >= gate.threshold && gate.enough && upcomingDays >= 0 &&
    upcomingDays <= UPCOMING_WINDOW_DAYS && sourceUrls.length >= 2 && verified;
  const alreadyCovered = knownTrendIds.has(id);
  return {
    id,
    event_slug: event.slug,
    content_slug: `${event.slug}-guide`,
    title: `${event.title.replace(/－[^－]+$/, '')}：${event.eventStart.slice(5).replace('-', '/')} 賽程、地點、規則與延期資訊`,
    intent: 'upcoming-event',
    score,
    decision: publishable && !alreadyCovered ? 'publish' : alreadyCovered ? 'refresh' : 'hold',
    publishable: publishable && !alreadyCovered,
    already_covered: alreadyCovered,
    observed_at: runDate,
    upcoming_days: upcomingDays,
    signals: {
      google_suggestions: googleHits,
      bing_suggestions: bingHits,
      google_count: googleHits.length,
      bing_count: bingHits.length,
      engines_online: [signal.available?.google && 'google', signal.available?.bing && 'bing'].filter(Boolean),
      score_threshold: gate.threshold === Infinity ? null : gate.threshold,
      degraded: gate.degraded,
      event_status: event.status,
      event_verification: event.verification,
      event_start: event.eventStart,
      city: event.city,
      venue_name: event.venueName,
      subtitle: event.subtitle,
    },
    source_urls: sourceUrls,
    required_phrases: [event.eventSeries, dateDisplay, event.city, event.venueName].filter(Boolean),
    reason: [
      publishable
        ? alreadyCovered ? '已有同一趨勢文章，交給既有文章更新，不新增重複頁。'
          : gate.degraded ? '單一搜尋引擎建議字（降級判準）＋近期已驗證賽事＋至少兩個可追溯來源。'
          : '雙搜尋引擎建議字＋近期已驗證賽事＋至少兩個可追溯來源。'
        : '訊號或來源未達自動發布門檻，保留觀察，不新增文章。',
      gate.note,
    ].filter(Boolean).join(' '),
  };
};

export const collectTrendData = async ({ runDate = dateArg() } = {}) => {
  const warnings = [];
  const knownTrendIds = existingTrendIds();
  let rss = { status: 'error', url: TREND_RSS_URL, items: [], relevant_items: [] };
  try {
    const raw = await fetchText(TREND_RSS_URL, TREND_TIMEOUT_MS);
    const items = parseTrendingRss(raw);
    const relevantTerms = SEEDS.map(normalize).filter((term) => term.length >= 2);
    rss = {
      status: 'ok',
      url: TREND_RSS_URL,
      items,
      relevant_items: items.filter((item) => relevantTerms.some((term) => normalize(item.title).includes(term))),
    };
  } catch (error) {
    rss.error = error?.message ?? String(error);
    warnings.push(`Google Trends RSS 抓取失敗：${rss.error}`);
  }

  const events = parseEvents()
    .map((event) => ({ ...event, upcoming_days: dateDistance(runDate, event.eventStart) }))
    .filter((event) => event.upcoming_days >= 0 && event.upcoming_days <= UPCOMING_WINDOW_DAYS)
    .filter((event) => !['cancelled', 'archived', 'draft'].includes(event.status));
  const queries = [...new Set([
    ...SEEDS,
    ...events.flatMap((event) => [event.eventSeries, `${event.eventSeries ?? ''} ${stripCitySuffix(event.city)}`.trim()]),
  ].filter(Boolean))];
  const querySignals = [];
  for (const query of queries) querySignals.push(await querySuggestions(query, warnings));
  const byQuery = new Map(querySignals.map((signal) => [normalize(signal.query), signal]));
  const EMPTY_SIGNAL = { google: [], bing: [], available: { google: false, bing: false } };
  const candidates = events.map((event) => {
    const seriesSignal = byQuery.get(normalize(event.eventSeries)) ?? EMPTY_SIGNAL;
    const citySignal = byQuery.get(normalize(`${event.eventSeries ?? ''} ${stripCitySuffix(event.city)}`.trim())) ?? EMPTY_SIGNAL;
    return buildCandidate(event, {
      google: [...new Set([...(seriesSignal.google ?? []), ...(citySignal.google ?? [])])],
      bing: [...new Set([...(seriesSignal.bing ?? []), ...(citySignal.bing ?? [])])],
      // 引擎可用性要跟著訊號一起傳進去，否則 buildCandidate 看到的永遠是「兩個都不可用」，
      // 於是連降級判準都用不上——修了門檻卻忘了接線，等於沒修（2026-08-27 當場踩到）。
      available: {
        google: Boolean(seriesSignal.available?.google || citySignal.available?.google),
        bing: Boolean(seriesSignal.available?.bing || citySignal.available?.bing),
      },
    }, runDate, knownTrendIds);
  }).sort((a, b) => b.score - a.score || a.upcoming_days - b.upcoming_days);

  // 每日最多送一個新頁進自動發布候選；其餘保留證據但不讓 brain 一次開多個新頁。
  let publishedCandidate = false;
  for (const candidate of candidates) {
    if (candidate.decision !== 'publish') continue;
    if (publishedCandidate) {
      candidate.decision = 'hold';
      candidate.publishable = false;
      candidate.reason = '本日已選出一個候選，避免同日批量新增教育文。';
    } else {
      publishedCandidate = true;
    }
  }

  // 引擎總狀態：任何一天有引擎全程抓不到，就要在報告最上面說出來。
  // 這條之所以存在：2026-08-17 建立產線到 08-27 的每一份 JSON 裡，Google 都是 403，
  // 而輸出只寫「訊號未達門檻」——看起來像需求不足，實際上是量測管道斷了。
  const engineStatus = {
    google: querySignals.some((sig) => sig.available?.google) ? 'ok' : 'unavailable',
    bing: querySignals.some((sig) => sig.available?.bing) ? 'ok' : 'unavailable',
  };
  for (const [engine, status] of Object.entries(engineStatus)) {
    if (status === 'unavailable') {
      warnings.unshift(`⚠️ ${engine} 建議字整輪不可用（所有種子皆抓取失敗）。`
        + `需求訊號本輪只有另一個引擎，判準已降級——不要把這一輪的結果讀成「雙引擎驗證過」。`);
    }
  }

  return {
    schema_version: 1,
    site: 'twdro.net',
    observed_on: runDate,
    collected_at: new Date().toISOString(),
    methodology: {
      trend_signal: 'Google Trends RSS；若 unavailable/無相關項目，不視為需求為零。',
      demand_signal: 'Google 與 Bing 建議字交叉比對；某引擎抓不到時記為「不可用」，不當成 0 個建議字。',
      fact_signal: '只使用站內已驗證、21 天內開始的公開賽事，來源至少含站內頁與一筆外部來源。',
      publish_policy: '雙引擎都在線：score >= 7 且各至少兩個相關建議字。'
        + '只剩一個引擎在線：降級為 score >= 5 且該引擎 >= 3 個相關建議字，'
        + '並在 candidate.reason 與 warnings 標明降級（沒有第二個來源佐證）。'
        + '兩個引擎都不在線：不發布。來源 >= 2、每日最多 1 個新頁不變。',
    },
    autocomplete_engines: engineStatus,
    seeds: SEEDS,
    google_trends_rss: rss,
    autocomplete: querySignals,
    upcoming_events: events,
    candidates,
    warnings,
  };
};

const main = async () => {
  const runDate = dateArg();
  const data = await collectTrendData({ runDate });
  mkdirSync(TREND_DIR, { recursive: true });
  const output = join(TREND_DIR, `${runDate}.json`);
  writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
  const publish = data.candidates.find((candidate) => candidate.publishable);
  console.log(`[trend-radar] ${runDate} RSS=${data.google_trends_rss.status} queries=${data.autocomplete.length} upcoming=${data.upcoming_events.length}`);
  console.log(`[trend-radar] candidate=${publish?.id ?? 'none'} score=${publish?.score ?? '-'} decision=${publish?.decision ?? 'no-op'}`);
  if (data.warnings.length) console.log(`[trend-radar] warnings=${data.warnings.length}`);
  console.log(`[trend-radar] wrote ${output}`);
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await main();
