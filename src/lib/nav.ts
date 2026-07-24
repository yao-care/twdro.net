// 全站資訊架構（IA）單一真實來源。
// SiteHeader / SiteFooter / 人類可讀 sitemap 頁共用，避免導覽各處硬編碼、集合變孤兒。
// 路徑一律結尾帶斜線（astro.config trailingSlash:'always'），交由 lib/url.ts 的 url() 補 base 前綴。

export interface NavItem {
  href: string;
  label: string;
}

// header 主選單：精選高頻入口（避免塞爆；其餘經 footer 與 /sitemap 進入）。
export const PRIMARY_NAV: NavItem[] = [
  { href: '/events/', label: '賽事' },
  { href: '/rules/', label: '規則' },
  { href: '/equipment/', label: '器材' },
  { href: '/teams/', label: '隊伍' },
  { href: '/learn/', label: '認識無人機足球' },
  { href: '/faq/', label: '常見問題' },
  { href: '/search/', label: '搜尋' },
];

// footer 主要內容集合（與 header 呼應）。
export const CONTENT_NAV: NavItem[] = [
  { href: '/events/', label: '賽事' },
  { href: '/rules/', label: '規則' },
  { href: '/equipment/', label: '器材' },
  { href: '/teams/', label: '隊伍' },
  { href: '/learn/', label: '認識無人機足球' },
];

// footer 資料與資源：把原本的孤兒集合（場地/單位/最新消息）納入導覽。
export const RESOURCE_NAV: NavItem[] = [
  { href: '/venues/', label: '場地' },
  { href: '/organizations/', label: '參與單位' },
  { href: '/news/', label: '最新消息' },
  { href: '/faq/', label: '常見問題' },
  { href: '/sitemap/', label: '網站地圖' },
  { href: '/search/', label: '站內搜尋' },
];

// footer 關於／法務。
export const LEGAL_NAV: NavItem[] = [
  { href: '/about/', label: '關於本站' },
  { href: '/about/sources/', label: '資料來源' },
  { href: '/about/correction/', label: '回報資料錯誤' },
  { href: '/about/privacy/', label: '隱私權政策' },
  { href: '/about/terms/', label: '使用條款' },
  { href: '/about/disclaimer/', label: '免責聲明' },
];

// 完整分組結構，給人類可讀 /sitemap 頁。
// collection + urlBase 有值者，sitemap 頁會 getCollection 動態列出各條目（連到 urlBase+slug）。
// subPages 為該區塊的靜態工具子頁。
export interface SiteSection {
  title: string;
  href: string;          // 區塊索引頁
  collection?: string;   // 有明細頁的集合名
  urlBase?: string;      // 明細頁 URL 前綴，如 '/events/'
  subPages?: NavItem[];  // 靜態子頁（工具頁等）
}

export const SITE_SECTIONS: SiteSection[] = [
  { title: '賽事', href: '/events/', collection: 'events', urlBase: '/events/', subPages: [{ href: '/events/calendar/', label: '賽事行事曆' }] },
  { title: '規則', href: '/rules/', collection: 'rulebooks', urlBase: '/rules/', subPages: [{ href: '/rules/compare/', label: '規則比較' }] },
  { title: '器材', href: '/equipment/', collection: 'equipment', urlBase: '/equipment/', subPages: [{ href: '/equipment/compliance-check/', label: '器材合規檢查' }] },
  { title: '隊伍', href: '/teams/', collection: 'teams', urlBase: '/teams/' },
  { title: '場地', href: '/venues/', collection: 'venues', urlBase: '/venues/' },
  { title: '參與單位', href: '/organizations/', collection: 'organizations', urlBase: '/organizations/' },
  { title: '認識無人機足球', href: '/learn/', collection: 'learn', urlBase: '/learn/' },
  { title: '最新消息', href: '/news/', collection: 'news' },
  { title: '常見問題', href: '/faq/' },
  { title: '關於本站', href: '/about/', subPages: LEGAL_NAV.slice(1) },
];
