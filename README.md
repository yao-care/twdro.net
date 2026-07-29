# twdro.net — 台灣無人機足球資料與賽事平台

靜態網站（Astro + GitHub Pages），資料由 `src/content/` 內的 YAML/Markdown 驅動。

## 開發
```bash
npm install
npm run dev      # 本地預覽
npm run build    # 產出 dist/
npm run test     # 單元測試
```

## 資料維護
- 賽事：`src/content/events/<slug>.yml`
- 規則：`src/content/rulebooks/`、`src/content/rules/`
- 隊伍/場地/器材/組織：對應 `src/content/` 子目錄
- 文章：`src/content/learn/<slug>.md`

新增資料 = 新增檔案（檔名即網址）。所有欄位由 `src/content.config.ts` 的 Zod schema 驗證，
缺欄位或狀態值錯誤會使 build 失敗。**不得在 `teams` 加入選手個資欄位。**

## 部署
push 到 `main` 由 `.github/workflows/deploy.yml` 自動建置並發佈至 GitHub Pages，
線上網址 `https://twdro.net`（`public/CNAME` + `astro.config.mjs` 的 `site`／`base: '/'`）。
build → test → 上線 → IndexNow，測試不過不會部署。
`source-links` job 平行跑來源網址健檢，**不擋部署**但失敗會讓 workflow 標記失敗。

## 資料來源健檢
每一筆資料都標了來源網址，但學校公告下架、換網址是常態——2026-07-29 手動抽查就發現
37 筆來源有 4 筆 404（其中 1 筆是我們自己把網址打錯字）。這種壞法無聲無息：頁面照樣
渲染、build 照樣過，只有真的去點的人才發現，而會去點的正是我們最想說服的那群人。

```bash
node scripts/check-source-links.mjs   # 全查，有失效則 exit 1
```
- 403／406 等視為「對方擋機器人」，不算失效。
- Facebook 等社群平台列為「無法自動驗證」，需人工複查。
- 確認永久下架又暫無替代的，寫進 `scripts/known-dead-links.json` 降級成提醒——
  那是待辦清單，不是垃圾桶，每次執行都會印出來。

## 搜尋引擎收錄
- **sitemap `<lastmod>`**：由 `src/lib/lastmod.mjs` 依內容本身的 `updated_at`／`retrieved_at` 產生，
  沒有日期欄位的集合（venues／organizations）與靜態 .astro 頁退回該檔的 git commit 日期。
  不蓋建置時間——假訊號會被搜尋引擎學會忽略。
  **CI 的 checkout 必須 `fetch-depth: 0`**，淺層 clone 拿不到 git 歷史，那些頁會無聲失去 lastmod。
- **IndexNow**：部署後 `scripts/indexnow-submit.mjs` 讀線上 sitemap，只推 lastmod 3 天內的網址。
  金鑰檔 `public/be644c81fe9010bea60de485d1544bf2.txt` 必須隨站部署，刪掉推送會全部失效。
  本機驗證：`node scripts/indexnow-submit.mjs --local --dry-run`。
- **Google 不參與 IndexNow**：Google 端只有 sitemap lastmod 與 Search Console 手動「要求建立索引」兩個手段。
- 守門在 `tests/sitemap-lastmod.test.ts` 與 `tests/trailing-slash.test.ts`——這兩組各對應一次真實的收錄事故。

## 資料 Pipeline
半自動資料取得與個資防護見 [`pipeline/README.md`](pipeline/README.md)。pipeline 產出候選並開 PR，人工審核後才上站。
