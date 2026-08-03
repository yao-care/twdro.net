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
- 確認永久下架又暫無替代的，在該筆來源加 `unavailable_since: "YYYY-MM-DD"`：
  頁面會標明「原公告已下架」並保留網址供追溯，健檢降級成提醒但每次執行都印出來。
  標註寫在資料裡而非另一份清單——清單會與資料脫節，而「這個來源掛了」本來就是
  資料的一部分。若該網址日後復活，健檢會提醒把欄位刪掉，避免畫面一直對讀者說謊。

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

## 訂閱來源（RSS／iCalendar）

站上最有時效性的東西是**報名截止日**與**成績公布**，但讀者看過一次之後沒有任何機制把他
叫回來——只能靠自己記得再搜一次。兩份訂閱檔就是那個機制，隨站部署、無後端。

- `/rss.xml`（`src/pages/rss.xml.ts`）：news 公告 ＋ 全部公開賽事。賽事的 `pubDate` 取各來源
  `retrieved_at` 的最大值（＝我方最後確認日，與 sitemap lastmod 同一套語意），摘要寫明
  狀態與「已公布成績／成績尚未公布」。全站 `<head>` 有 `rel="alternate"` 宣告，閱讀器才發現得到。
- `/events/calendar.ics`（`src/pages/events/calendar.ics.ts`）：每場賽事產出賽期 VEVENT，
  **有 `registration_end` 的另外產一筆「報名截止」**——那才是訂閱的主要理由。
  UID 跨次建置穩定（`event-<slug>@twdro.net`），否則訂閱者的日曆會不斷長出重複事件。

編碼規則集中在 `src/lib/feed.ts`：iCalendar 每行上限 75 **位元組**（中文一字 3 bytes，
按長度切會超標、按 byte 硬切會把字剖成兩半）、行尾一律 CRLF、全天事件 DTEND 排他 +1 天。
**這些壞掉時檔案照樣產生、build 照樣過、畫面看不出來**，只有真的拿去訂閱的人才知道，
所以 `tests/feeds.test.ts` 逐條釘在建置產物層。

## 資料 Pipeline
半自動資料取得與個資防護見 [`pipeline/README.md`](pipeline/README.md)。pipeline 產出候選並開 PR，人工審核後才上站。

---

Maintained by Light. I build and maintain websites with AI as a service: [arthurs.tw](https://arthurs.tw/?utm_source=github&utm_medium=readme&utm_campaign=oss)
