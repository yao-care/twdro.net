import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { buildLastmodMap } from './src/lib/lastmod.mjs';

// sitemap 的 lastmod 取自內容本身的查核／更新日期，理由與規則見 src/lib/lastmod.mjs。
const TODAY = new Date().toISOString().slice(0, 10);
const LASTMOD = buildLastmodMap('src/content', TODAY);

// 綁定自訂網域 twdro.net（裸網域為 canonical）。
// public/CNAME 讓 GitHub Pages 認得自訂網域；base '/' 讓資源走根路徑。
export default defineConfig({
  site: 'https://twdro.net',
  base: '/',
  // 已上線的網址不當作可以隨手刪的東西。這裡的每一筆都是**內容合併**留下的舊路徑：
  // 場館名錄裡同一個地點曾因為兩場賽事的 venue_name 寫法不同（「埔里鎮寶大飯店」與
  // 「埔里鎮寶大飯店 17 樓國際會議廳」）而長成兩頁。合併成一筆是對的，但舊網址已經
  // 上線、可能被索引，直接消失就是我們自己製造 link rot——而站上有一支 CI 專門在抓
  // 別人的 link rot。靜態輸出會產出 meta-refresh 頁，舊網址仍然到得了新頁。
  redirects: {
    '/venues/puli-chengpao-hall/': '/venues/puli-chengpao/',
    // 同一所學校因為兩場賽事的名次字串寫法不同（「南投縣立埔里國中」與「（南投 埔里國中）」）
    // 而長成兩頁，戰績被拆成兩半——而埔里國中正是站上拿最多冠軍的學校。2026-08-30 把資料
    // 統一成短名合併，舊網址已在線上 sitemap 裡，同樣留轉址（理由見上一條）。
    '/teams/school/南投縣立埔里國中/': '/teams/school/埔里國中/',
  },
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // 站內搜尋結果頁不進 sitemap，也在 robots.txt 擋爬（理由見 public/robots.txt）：
      // 爬取預算要留給賽事與規則頁，別花在搜尋介面上。
      filter: (page) => !new URL(page).pathname.startsWith('/search/'),
      serialize(item) {
        const date = LASTMOD.get(new URL(item.url).pathname);
        // 沒有可信日期就不寫 lastmod（sitemap 規格允許缺省）；寧可少給，不給假訊號。
        // 固定用 UTC 午夜：sitemap 套件會把時間正規化成 Z，寫 +08:00 會讓 2026-07-28
        // 被換算成 2026-07-27T16:00Z，日期部分整個退一天，肉眼與測試都會誤判。
        if (date) item.lastmod = `${date}T00:00:00.000Z`;
        return item;
      },
    }),
  ],
});
