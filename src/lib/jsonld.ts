// 站台正式網址（與 astro.config site 對齊）。JSON-LD 需絕對 URL。
export const SITE_URL = 'https://twdro.net';
const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

// 本站的實體節點：無人機足球運動的資料與推廣平台。
// 本站為資料彙整平台，無自營社群帳號 → sameAs 僅列官方 canonical 首頁（來源稀疏）。
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
    sameAs: [`${SITE_URL}/`],
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

export function eventJsonLd(e: EventInput): Record<string, any> {
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
