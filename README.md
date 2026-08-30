# twdro.net — 台灣無人機足球資料與賽事平台

靜態網站（Astro + GitHub Pages），資料由 `src/content/` 內的 YAML/Markdown 驅動。

> **維護者請先讀 [`CLAUDE.md`](CLAUDE.md)**——完整維護手冊，含所有「現在是什麼狀態」的查詢指令。
>
> 這兩份文件都遵守同一條規則：**凡是跑一行指令就能問出來的當下狀態（幾筆、幾頁、幾％、
> 哪支健檢在紅），只留指令、不留數字。** 寫死的數字會過期，而過期的文件比沒有文件更危險——
> 它讓人有依據地做錯決定。文件裡出現的數字若非帶日期的歷史紀錄，就是 bug。

## 線上資料

正式網站：[twdro.net](https://twdro.net/)

- [臺灣無人機足球賽事：報名、賽程與成績](https://twdro.net/events/)
- [球機價格與購買指南](https://twdro.net/equipment/)
- [球機組裝步驟](https://twdro.net/learn/drone-assembly-basics/)
- [臺灣賽事、隊伍、場地與推廣單位入口](https://twdro.net/learn/taiwan-competitions-overview/)

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
`source-links` 與 `event-status` job 平行跑資料健檢，**不擋部署**但失敗會讓 workflow 標記失敗。

## 資料來源健檢
每一筆資料都標了來源網址，但學校公告下架、換網址是常態——2026-07-29 手動抽查 37 筆來源
就發現 4 筆 404，其中 1 筆是我們自己把網址打錯字（**那是當天的紀錄，不是現況；現況跑下面
那行指令**）。這種壞法無聲無息：頁面照樣渲染、build 照樣過，只有真的去點的人才發現，
而會去點的正是我們最想說服的那群人。

```bash
node scripts/check-source-links.mjs   # 全查，有失效則 exit 1
```
- 403／406 等視為「對方擋機器人」，不算失效。
- Facebook 等社群平台列為「無法自動驗證」，需人工複查。
- 確認永久下架又暫無替代的，在該筆來源加 `unavailable_since: "YYYY-MM-DD"`：
  頁面會標明「原公告已下架」並保留網址供追溯，健檢降級成提醒但每次執行都印出來。
  標註寫在資料裡而非另一份清單——清單會與資料脫節，而「這個來源掛了」本來就是
  資料的一部分。若該網址日後復活，健檢會提醒把欄位刪掉，避免畫面一直對讀者說謊。

## 每天檢查有沒有新資料
賽事與成績不會有人通知我們，只能自己每天去看。每支 pipeline 各盯一類來源，**全部只偵測不改寫**
（賽事與成績屬事實型資料，一律人工核實後手動上站）：

| 來源 | 盯什麼 |
|---|---|
| `pipeline-gov` | 教育部／政府資料 |
| `pipeline-events` | 固定的賽事公告頁 |
| `pipeline-intl` | FAI／FIDA 官方規則檔 |
| `pipeline-organizer` | 主辦協會官網文章 API |
| `pipeline-county` | 縣市政府／教育網 RSS |
| `pipeline-news` | **新聞媒體＋主辦單位自架的成績頁** |

排程時刻與來源覆蓋率不寫在這裡——**寫死就會跟設定檔脫節**，直接問：

```bash
ls .github/workflows/pipeline-*.yml            # 現在有哪幾支
grep -H 'cron:' .github/workflows/pipeline-*.yml   # 各自幾點跑（UTC，台北 = +8）

# 縣市 RSS 接上幾個縣市、幾個 feed
python3 -c "
import yaml
f=yaml.safe_load(open('pipeline/sources/county_feeds.yml'))['feeds']
c=sorted({x['label'][:3] for x in f})
print(f'{len(c)} 縣市 / {len(f)} feed'); print(' '.join(c))
"
```

⚠️ **排程時間只是「不早於」**。實測 2026-08-27：GitHub 對這個 repo 的排程平常延遲 24–30 分鐘，
但那一天四支 pipeline 全部被延遲 **169–299 分鐘**。延遲不要緊（還是同一天），真正的風險是
GitHub 在高載時**整個丟掉**排程執行，而且不會有任何錯誤訊息——那會讓「每天檢查」悄悄變成
「有時候檢查」。`pipeline-news` 因此在同一天排了不只一次當保險（次數見上面的 `grep cron`）；
`create-pull-request` 重用同一個分支，重複跑只會更新同一個 PR。要立刻跑一輪用 `gh workflow run "Pipeline · 新聞與主辦單位公告監看"`。

最後一支是 2026-08-27 補的，因為那天人工用搜尋挖到 4 場站上完全沒收錄的賽事、1 份九個名次的
官方成績名單、2 場「已打完但站上還寫著即將舉行」——而那些線索的來源（新聞、Google Sites 上的
成績頁、uasact.com）**沒有任何一支既有 pipeline 在看**。來源清單在
`pipeline/sources/news_queries.yml`，加一個查詢或一個頁面不必改程式。

```bash
python -m pipeline.run --source news_watch   # 本機跑一輪
```
只對「沒看過的標題」告警（`is_new`），含成績字樣的另外挑到 `results_candidates` 讓人先看。
抓取錯誤記在 `fetch_errors` 但**不進指紋**——來源掛掉不是「有新消息」。

## 賽事資料健檢
賽事是站上最有時效性的東西，而它會用兩種無聲的方式壞掉：狀態沒跟著日期走（一場 8/8 打完的
比賽到了 8/27 還掛「已公告」，畫面就把它排進「即將舉行」），以及整頁沒有任何來源——
而 `verification` 只在有來源時才顯示，於是**最沒有依據的頁面反而最安靜**。兩種都不會讓
build 失敗、不會讓測試轉紅。

```bash
node scripts/check-event-status.mjs   # 有問題則 exit 1
```
- 狀態仍是 announced／registration_open／ongoing／postponed 但賽期已過 → 列出來要人查證後改 status。
- `sources` 空的賽事 → 列出來。查不到來源就別讓欄位停在推測值。
- 刻意不提供豁免清單：要靜音某一筆的方式是把資料修好。
- 賽事頁本身也會在「無來源或 verification: outdated」時直接對讀者說明，並附回報入口。

## 搜尋引擎收錄
- **sitemap `<lastmod>`**：由 `src/lib/lastmod.mjs` 依內容本身的 `updated_at`／`retrieved_at` 產生，
  沒有日期欄位的集合（venues／organizations）與靜態 .astro 頁退回該檔的 git commit 日期。
  不蓋建置時間——假訊號會被搜尋引擎學會忽略。
  **CI 的 checkout 必須 `fetch-depth: 0`**，淺層 clone 拿不到 git 歷史，那些頁會無聲失去 lastmod。
- **IndexNow**：部署後 `scripts/indexnow-submit.mjs` 讀線上 sitemap，只推最近更新的網址
  （天數見該檔的 `RECENT_DAYS`）。
  金鑰檔 `public/be644c81fe9010bea60de485d1544bf2.txt` 必須隨站部署，刪掉推送會全部失效。
  本機驗證：`node scripts/indexnow-submit.mjs --local --dry-run`。
- **Google 不參與 IndexNow**：Google 端只有 sitemap lastmod 與 Search Console 手動「要求建立索引」兩個手段。
- 守門在 `tests/sitemap-lastmod.test.ts` 與 `tests/trailing-slash.test.ts`——這兩組各對應一次真實的收錄事故。

## 訂閱來源（RSS／iCalendar）

站上最有時效性的東西是**報名截止日**與**成績公布**，但讀者看過一次之後沒有任何機制把他
叫回來——只能靠自己記得再搜一次。訂閱檔就是那個機制，隨站部署、無後端。

- `/rss.xml`（`src/pages/rss.xml.ts`）：news 公告 ＋ 全部公開賽事。賽事的 `pubDate` 取各來源
  `retrieved_at` 的最大值（＝我方最後確認日，與 sitemap lastmod 同一套語意），摘要寫明
  狀態與「已公布成績／成績尚未公布」。全站 `<head>` 有 `rel="alternate"` 宣告，閱讀器才發現得到。
- `/events/calendar.ics`（`src/pages/events/calendar.ics.ts`）：每場賽事產出賽期 VEVENT，
  **有 `registration_end` 的另外產一筆「報名截止」**——那才是訂閱的主要理由。
  UID 跨次建置穩定（`event-<slug>@twdro.net`），否則訂閱者的日曆會不斷長出重複事件。

編碼規則集中在 `src/lib/feed.ts`：iCalendar 每行有**位元組**上限（RFC 5545 §3.1，中文一字 3 bytes，
按長度切會超標、按 byte 硬切會把字剖成兩半）、行尾一律 CRLF、全天事件 DTEND 排他 +1 天。
**這些壞掉時檔案照樣產生、build 照樣過、畫面看不出來**，只有真的拿去訂閱的人才知道，
所以 `tests/feeds.test.ts` 逐條釘在建置產物層。

## 資料 Pipeline
半自動資料取得與個資防護見 [`pipeline/README.md`](pipeline/README.md)。pipeline 產出候選並開 PR，人工審核後才上站。

---

Maintained by Light. I build and maintain websites with AI as a service: [arthurs.tw](https://arthurs.tw/?utm_source=github&utm_medium=readme&utm_campaign=oss)
