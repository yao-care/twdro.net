import { defineConfig } from 'astro/config';

// DNS 未設前先部署到專案子路徑 https://yao-care.github.io/twdro.net/
// 之後綁定 twdro.net 時：site 改 'https://twdro.net'、base 改 '/'、並新增 public/CNAME
export default defineConfig({
  site: 'https://yao-care.github.io',
  base: '/twdro.net',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
