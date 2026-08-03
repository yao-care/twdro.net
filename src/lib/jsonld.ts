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
    // 同一項運動在臺灣有兩個通行譯名，兩個都列出來讓實體判定不會漏掉「飛球」那半邊的查詢。
    sport: ['無人機足球', '無人機飛球'],
    description:
      '臺灣無人機足球（又稱無人機飛球，Drone Soccer）的賽事、規則、隊伍、場地與器材資料平台，整理政府公告、學校、協會與國際規則，每筆標明來源與查核日期。',
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

// ── 索引頁與實體明細頁（2026-08-03 補）──────────────────────────────────
// 起因：實測 dist 102 頁只有 83 頁帶 JSON-LD，缺的 19 頁**全是索引／樞紐頁**
// （含旗艦頁 /events 與 /learn），而 organizations／venues／teams 這些實體明細頁
// 也只輸出 BreadcrumbList，沒有任何實體節點——等於「有資料庫但沒告訴 Google 這是什麼」。
//
// ⚠️ 沿用 07-26 的教訓：**寧可不輸出，也不要輸出殘缺項**。因此：
//   - equipment 刻意不出 Product／Offer：list_price 是自由書寫的中文句子
//     （「NT$13,000–15,000（課程方案價…）」「NT$9,700（已完售）」、一筆多 SKU），
//     拆不出乾淨的 price／priceCurrency／availability，硬拆等於對 Google 說謊。
//   - rules 刻意不出 Article：那是規則書的條文片段，不是獨立作品。

/** 索引頁：CollectionPage + 內嵌 ItemList。items 需為絕對 URL。 */
export function collectionPageJsonLd(p: {
  name: string;
  url: string;
  description?: string;
  items: { name: string; url: string }[];
}): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: p.name,
    url: p.url,
    ...(p.description ? { description: p.description } : {}),
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: p.items.length,
      itemListElement: p.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        url: it.url,
      })),
    },
  };
}

/** 純資訊頁（關於／隱私／條款／網站地圖…）：沒有清單可列時用這個，仍宣告 isPartOf。 */
export function webPageJsonLd(p: {
  name: string;
  url: string;
  description?: string;
}): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: p.name,
    url: p.url,
    ...(p.description ? { description: p.description } : {}),
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
  };
}

/**
 * 第三方單位明細頁。**不設 sameAs**——理由同 organizationNode：sameAs 指的是該實體在
 * 其他權威平台的身分，而我們手上只有它自己的官網，那是 `url` 不是 sameAs。
 */
export function organizationJsonLd(o: {
  name: string;
  url: string; // 本站該單位頁的絕對 URL
  website?: string;
  city?: string;
  country?: string;
}): Record<string, any> {
  const address = o.city || o.country
    ? {
        '@type': 'PostalAddress',
        ...(o.city ? { addressRegion: o.city } : {}),
        ...(o.country ? { addressCountry: o.country } : { addressCountry: '臺灣' }),
      }
    : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: o.name,
    // 有官網就以官網為實體主網址，本站頁面改列 subjectOf；沒有才退回本站頁面。
    url: o.website ?? o.url,
    ...(address ? { address } : {}),
    subjectOf: { '@type': 'WebPage', url: o.url },
  };
}

/** 場地明細頁。無街道地址，只有縣市／行政區與經緯度——照實填，不編門牌。 */
export function placeJsonLd(v: {
  name: string;
  url: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
}): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: v.name,
    url: v.url,
    ...(v.city || v.district
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(v.city ? { addressRegion: v.city } : {}),
            ...(v.district ? { addressLocality: v.district } : {}),
            addressCountry: '臺灣',
          },
        }
      : {}),
    ...(typeof v.latitude === 'number' && typeof v.longitude === 'number'
      ? { geo: { '@type': 'GeoCoordinates', latitude: v.latitude, longitude: v.longitude } }
      : {}),
  };
}

/** 隊伍明細頁。個資紅線：只放隊伍層級欄位，永遠不含選手。 */
export function sportsTeamJsonLd(t: {
  name: string;
  url: string;
  alternateName?: string;
  city?: string;
  district?: string;
}): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: t.name,
    url: t.url,
    sport: ['無人機足球', '無人機飛球'],
    ...(t.alternateName ? { alternateName: t.alternateName } : {}),
    ...(t.city
      ? {
          location: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressRegion: t.city,
              ...(t.district ? { addressLocality: t.district } : {}),
              addressCountry: '臺灣',
            },
          },
        }
      : {}),
  };
}
