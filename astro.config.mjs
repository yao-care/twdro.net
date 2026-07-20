import { defineConfig } from 'astro/config';

// 綁定自訂網域 twdro.net（裸網域為 canonical）。
// public/CNAME 讓 GitHub Pages 認得自訂網域；base '/' 讓資源走根路徑。
export default defineConfig({
  site: 'https://twdro.net',
  base: '/',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
