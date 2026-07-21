import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 綁定自訂網域 twdro.net（裸網域為 canonical）。
// public/CNAME 讓 GitHub Pages 認得自訂網域；base '/' 讓資源走根路徑。
export default defineConfig({
  site: 'https://twdro.net',
  base: '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
