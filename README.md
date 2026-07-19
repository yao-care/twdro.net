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
push 到 `main` 由 `.github/workflows/deploy.yml` 自動建置並發佈至 GitHub Pages。
- **現階段（DNS 未設）**：服務於 `https://yao-care.github.io/twdro.net/`（`astro.config.mjs` 的 `base: '/twdro.net'`）。
- **綁定 `twdro.net` 後**：將 `base` 改為 `/`、`site` 改為 `https://twdro.net`、新增 `public/CNAME`（內容 `twdro.net`），並於 Pages 設定填入自訂網域。

## 資料 Pipeline
半自動資料取得與個資防護見 [`pipeline/README.md`](pipeline/README.md)。pipeline 產出候選並開 PR，人工審核後才上站。
