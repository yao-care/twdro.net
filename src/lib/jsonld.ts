// 站台正式網址（與 astro.config site 對齊）。JSON-LD 需絕對 URL。
export const SITE_URL = 'https://twdro.net';
const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

// 本站的實體節點：無人機足球運動的資料與推廣平台。
// ⚠️ 不設 sameAs：sameAs 的語意是「本實體在**其他**權威平台的身分」（維基百科/Wikidata/官方社群）。
// 本站目前無自營官方帳號，指向自己的 canonical 網址屬語意錯誤（等於宣告「我＝我」），
// 不但零價值，日後真有官方帳號時還會混淆實體判定 → 一律留空，取得真實外部身分再補。
function organizationNode(): Record<string, any> {
  return {
    '@type': ['SportsOrganization', 'Organization'],
    '@id': ORG_ID,
    name: 'twdro.net｜臺灣無人機足球',
    url: `${SITE_URL}/`,
    sport: '無人機足球',
    description:
      '臺灣無人機足球（Drone Soccer）的賽事、規則、隊伍、場地與器材資料平台，整理政府公告、學校、協會與國際規則，每筆標明來源與查核日期。',
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/favicon.svg`,
    },
  };
}

function websiteNode(): Record<string, any> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'twdro.net',
    url: `${SITE_URL}/`,
    description: '臺灣無人機足球的賽事、規則、隊伍、場地與器材資料，每筆標明來源與查核日期。',
    inLanguage: 'zh-Hant',
    publisher: { '@id': ORG_ID },
  };
}

// 首頁：SportsOrganization + WebSite 合併為單一 @graph。
export function siteGraphJsonLd(): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationNode(), websiteNode()],
  };
}

export interface ArticleInput {
  headline: string;
  description?: string;
  url: string; // 絕對 URL
  datePublished?: string;
  dateModified?: string;
}

export function articleJsonLd(a: ArticleInput): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.headline,
    ...(a.description ? { description: a.description } : {}),
    ...(a.datePublished ? { datePublished: a.datePublished } : {}),
    ...(a.dateModified ? { dateModified: a.dateModified } : {}),
    inLanguage: 'zh-Hant',
    author: { '@type': 'Organization', name: 'twdro.net｜臺灣無人機足球', url: `${SITE_URL}/` },
    publisher: organizationNode(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    isPartOf: { '@id': WEBSITE_ID },
  };
}

export interface EventInput {
  name: string;
  startDate?: string;
  endDate?: string;
  url: string;
  locationName?: string;
}

// Google 的 Event 複合式搜尋結果規範：name／startDate／location 皆為**必填**。
// 缺任一就回傳 null、整段不輸出——寧可沒有結構化資料，也不送出 GSC 會判定為「無效項目」的殘缺 Event。
// ⚠️ 不以「臺灣」等泛稱填補：分區賽這類賽事本就分散於多縣市，捏造地點既違反本站
//    「每筆標明來源」的原則，Google 也會判為不精確。缺場地＝資料本身還不到可標記的程度。
// 病灶記錄：2026-07-26 GSC 回報「location 欄位未填」＝ 2026-moe-regional（分區賽，無 venue_name）。
export function eventJsonLd(e: EventInput): Record<string, any> | null {
  if (!e.startDate || !e.locationName) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: e.name,
    ...(e.startDate ? { startDate: e.startDate } : {}),
    ...(e.endDate ? { endDate: e.endDate } : {}),
    url: e.url,
    ...(e.locationName ? { location: { '@type': 'Place', name: e.locationName } } : {}),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((i, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: i.name,
      item: i.url,
    })),
  };
}
