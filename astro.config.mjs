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
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
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
