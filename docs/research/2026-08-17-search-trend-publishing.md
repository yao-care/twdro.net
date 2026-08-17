# twdro.net：外部搜尋趨勢到安全發布的自動化研究

- 研究日期：2026-08-17
- 適用站台：<https://twdro.net>
- 研究範圍：Google Trends、Google Search Console / Search Central、Bing Webmaster / IndexNow 官方文件，以及本 repo 與 `/root/seo-ops` 的既有程式和設定
- 本文件先作為設計依據；文末另記錄 2026-08-17 已落地的窄門自動發布實作與第一輪結果。

## 結論

twdro.net 可以建立「外部趨勢發現 → 站內需求驗證 → 選題 → 安全發布 → 48 小時／7 天／14 天學習」流程，但不能把它做成「看到熱門字就生成新文章」。正確分工是：

1. **Google Trends 與 Bing Keyword Research 負責發現外部需求**。
2. **GSC 與 Bing Search Performance 負責驗證本站是否已獲得相關曝光，以及發布後是否有效**。
3. **趨勢資料只能證明有人在搜尋，不能當文章事實來源**；文章中的日期、地點、賽程、規則、價格與成績仍需可追溯的一手來源。
4. **優先更新既有事件／規則／器材頁**。只有搜尋意圖與既有頁明確不同，且能提供本站獨有價值時，才建立新 URL。
5. **自動發布只適合低風險、可機械驗證的既有頁更新**。新文章先自動開草稿 PR；規則、成績、取消／延期、金額與個資永遠要人工核實。
6. Google 官方目前只把一般文章的 sitemap 視為發現提示；**Google Indexing API 只適用 `JobPosting` 或內含 `BroadcastEvent` 的直播頁，不能拿來推一般文章或普通賽事頁**。

因此，第一版應該自動化「收集、判分、去重、產生草稿、測試、觀察與回饋」，而不是直接放寬所有內容的 main 分支寫入權限。

## 一、目前系統已具備什麼

### Repo 內

- Astro Content Collections 以 Zod 驗證 events、rulebooks、rules、teams、venues、equipment、organizations、learn 與 news；事實型資料已有 `sources`、`trust_level`、`retrieved_at` 與 `verification` 等欄位。[`src/content.config.ts`](../../src/content.config.ts)
- GitHub Actions 已有政府資料、賽事公告、國際規則、主辦單位文章及縣市公告監控；部分低風險資料可直接進 main，個資或高風險資料轉 PR。[`pipeline/README.md`](../../pipeline/README.md)
- main push 會先 build、test，再部署 GitHub Pages；部署後以 IndexNow 提交最近三天有可信 `lastmod` 的 URL。[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- sitemap 的 `lastmod` 取自內容的 `updated_at`、來源 `retrieved_at`、news `date`，缺值才退回 git 日期，不使用全站建置日。[`src/lib/lastmod.mjs`](../../src/lib/lastmod.mjs)
- 自動層目前禁止新增 `src/content/learn/` 文章；人工新增才可使用 `ALLOW_NEW_LEARN=1` 放行。這是刻意的內容預算守門，不應被趨勢流程暗中繞過。[`scripts/check-content-budget.mjs`](../../scripts/check-content-budget.mjs)
- 既有測試已守住賽事 title／description、資料來源呈現、文章中的資料斷言、canonical／斜線與 sitemap `lastmod`。

### `/root/seo-ops` 既有營運層

- `seo-collect.mjs` 每日收集 GA4、GSC、URL Inspection、target queries 與 sitemap 狀態；twdro.net 的日資料在 `seo-data/daily/`，設定為 `data.commit=false`。
- `/root/seo-ops/sites/twdro.net.json` 已有核心查詢、旗艦頁、watch groups、每日 gates、brain 與 reflect 設定。
- cron 目前依序執行 collect（台北 16:30）、reflect（17:00）、brain（17:35），週一產週報。這個順序可直接承接趨勢資料，不必另建一套會同時改工作樹的排程。
- brain 的 gates 已包含 `npm ci`、`npm run build`、`npm test` 與內容預算檢查；reflect 與 brain 共用鎖，避免同時修改 repo。

### 現況缺口

- 沒有官方外部趨勢收集器與原始觀測帳本。
- 沒有「趨勢候選 → 既有頁／新頁」的 canonical 與意圖去重。
- 沒有可重現的趨勢分數、到期時間、發布路徑與拒絕理由。
- 發布紀錄尚未把「候選、分數、來源快照、commit、URL、評估日」串成同一個 experiment。
- `scripts/index-watch.mjs` 目前會以 Google Indexing API 推送一般 sitemap URL；這超出 Google 官方列出的適用內容類型，不應納入新的趨勢發布流程，後續實作時應拆成「URL Inspection 監測」與合規的發現機制。

## 二、可用官方資料來源與限制

| 來源 | 可取得訊號 | 自動化可行性 | 主要限制 | 在流程中的角色 |
|---|---|---:|---|---|
| Google Trends「Trending now」台灣 RSS | 趨勢詞、發布時間、約略流量下限，以及部分相關新聞項目 | 高 | 是全體熱門新聞趨勢，不是無人機足球專屬；RSS 沒有完整 Explore 比較值；約略流量不是精確搜尋量 | 每 30–60 分鐘的廣域雷達 |
| Google Trends Trending now UI／CSV | 4 小時、24 小時、48 小時、7 天；active／ended、約略量與成長；CSV／RSS 匯出 | 中 | UI 匯出適合人工或受控作業；不可假設未記載的私有端點是穩定 API | 候選複核、短期速度判斷 |
| Google Trends Explore：Related queries | Top 與 Rising；Rising 是相較前期增長，`Breakout` 表示增幅超過 5,000% | 中／低 | 一般公開介面沒有可直接依賴的正式大量 API；低量詞可能為 0，資料有抽樣與雜訊 | 種子詞擴充、同義詞與具體意圖發現 |
| Google Trends API alpha | 一致尺度、五年窗口、日／週／月／年聚合、地區與次地區 | 目前低 | 只開放少量 alpha 測試者，不能當第一版必要依賴；資料仍是 search interest，不是絕對量 | 取得核准後取代部分人工 Explore |
| Google Trends BigQuery 公開資料 | International Top 25 與 Top 25 Rising，日粒度 | 中 | 只涵蓋約 50 個國家、每區 Top 25，對小眾題目通常太粗；啟用前要先驗證資料表確實含 TW | 每日廣域補充，不作唯一來源 |
| GSC Search Analytics API | query／page／country／device／date／hour；clicks、impressions、CTR、position | 高，repo 已有 | 一般 finalized 資料常延遲 2–3 天；hourly 可含近 10 天但為 preliminary；只回重要 rows，匿名／稀有查詢會省略 | 本站需求驗證、發布後成效 |
| Bing Webmaster Keyword Research | 根關鍵字、相關詞、問題詞、近 30 天 newly discovered、搜尋量趨勢，可依國家／語言／裝置篩選，最長六個月 | 中／低 | 官方文件描述的是 Webmaster Tools 介面，沒有文件化的 Keyword Research 自動 API；`newly discovered` 是最近才與根詞相關，不等於剛被發明的新查詢 | 每週人工匯入／複核 |
| Bing Search Performance／Webmaster API | 本站 query／page 的 impressions、clicks、CTR、position；Web／Chat 等來源 | 高（需帳號與權限） | 新站需數天才有資料；表格可能省略 rows；query／page 只屬 Web，並非所有垂直來源 | 第二搜尋引擎的發布後驗證 |
| IndexNow | 通知參與搜尋引擎 URL 已新增、更新或刪除 | 高，repo 已有 | HTTP 200 只表示收到通知，不保證 crawl、index 或排名；只應送真正變更 URL | 部署後通知 Bing 等參與者 |

2026-08-17 實際唯讀驗證 `<https://trends.google.com/trending/rss?geo=TW>` 可回傳台灣 RSS，含 `title`、`ht:approx_traffic`、`pubDate`，部分 item 含 `ht:news_item`。這證明第一版可使用官方 RSS，不需要依賴未受支援的第三方 Trends 套件。

### Google Trends 必須保留的解讀限制

- Trends 是經匿名、分類、彙總的 Google 搜尋樣本，不是完整搜尋日誌。
- Explore 會按指定地區與時段正規化，再縮放為 0–100；不同請求的 100 不能直接當相同絕對量。
- 低搜尋量詞可能顯示 0；小量資料的隨機雜訊會更明顯。
- Trending now 是相對基準的近期突升，且多與新聞事件相關；熱門不代表適合本站。
- `Breakout` 是增幅超過 5,000%，不代表有龐大絕對搜尋量。
- Trends 資料若在網站或報告中重用，應標示 Google Trends 為資料來源。

### GSC 必須保留的解讀限制

- finalized 資料通常在 2–3 天後可用；最新小時資料可用 `dataState=hourly_all`，最多取得近 10 天，但 incomplete 時段仍會變動。
- API 不保證回傳所有 rows，只回 top rows；`rowLimit` 最高 25,000，也不能消除內部截斷。
- 匿名與稀有查詢不會完整出現在 query 表，所以「query rows 加總」可能小於總曝光。
- 發布後 48 小時若為 0，不足以判定內容失敗；先看 URL 是否可抓、是否被發現，再等 finalized 成效。
- 平均排名只適合觀察趨勢；決策應優先看 impressions、clicks 與 CTR。

## 三、候選資料模型

第一版應保存「原始觀測」與「經判分候選」兩層，避免分數規則改版後無法重算。

### 原始觀測 `trend_observation`

```json
{
  "observation_id": "sha256(source|geo|query|observed_at_bucket)",
  "source": "google_trends_trending_rss",
  "source_url": "https://trends.google.com/trending/rss?geo=TW",
  "geo": "TW",
  "language": "zh-Hant",
  "query": "原始趨勢詞",
  "observed_at": "2026-08-17T06:00:00Z",
  "published_at": "來源提供的時間",
  "approx_traffic_lower_bound": 100,
  "growth_percent": null,
  "breakout": false,
  "raw_hash": "sha256(raw item)",
  "raw_source_kind": "official"
}
```

`100+` 只能存成 lower bound 100，不得改寫為精確 100；RSS 沒提供 growth 時必須是 `null`，不得估算。

### 判分候選 `trend_candidate`

```json
{
  "candidate_id": "stable topic cluster id",
  "queries": ["無人機足球 台南", "天穹盃 台南"],
  "intent": "event_schedule",
  "entity_keys": ["event:2026-skycup-tainan"],
  "topic_fit": "direct",
  "target_action": "update_existing",
  "target_url": "/events/2026-skycup-tainan/",
  "official_fact_sources": [],
  "score_version": 1,
  "score": 0,
  "score_components": {},
  "penalties": [],
  "status": "watch",
  "expires_at": "2026-08-24T00:00:00Z"
}
```

候選必須保留每個分項與拒絕理由，不能只留總分；brain 與 reflect 才能知道是「熱度不足」、「不合站台」、「沒有官方事實來源」或「已有頁可更新」。

## 四、趨勢判分 v1（0–100）

先跑硬性資格，再算分數。任何 hard reject 都不能靠高熱度抵銷。

### 硬性資格

1. **受眾符合**：主題須直接關聯台灣無人機足球／飛球、賽事、規則、隊伍、場地、教育活動或站內器材用途。一般無人機軍事、股價、事故等熱門詞不因含「無人機」就通過。
2. **有可回答的使用者任務**：日期、地點、報名、賽程、成績、規則差異、球機規格或參與方式；只有關鍵字、沒有可完成任務者不發布。
3. **有一手事實來源**：趨勢資料只證明需求；文章事實至少要有一筆主辦單位、政府、規則制定組織或廠商官方來源。
4. **無受保護個資**：疑似未成年姓名、聯絡方式或名冊直接 reject，轉人工處理。
5. **canonical／意圖去重**：相同事件或相同任務已有頁面時只能更新既有 URL，不得另建「懶人包」搶同一意圖。

### 分數

| 分項 | 分數 | 確定性規則 |
|---|---:|---|
| 站台與受眾吻合度 | 0–25 | 直接的台灣賽事／規則／報名／成績 25；器材、組裝、課程等明確需求 20；相鄰無人機教育 10；只有字面相關 0 |
| 外部趨勢速度 | 0–25 | RSS 新鮮度：1 小時內 8、6 小時內 5、24 小時內 2；約略流量 lower bound：≥10,000 得 7、≥1,000 得 5、≥500 得 4、≥100 得 2；Related Rising：Breakout 10、≥1,000% 得 8、≥200% 得 6、≥50% 得 3。缺值就是 0，不補估 |
| 本站需求證據 | 0–20 | GSC 同群 query 近 7／28 天 impressions 與週對週增幅最多 15；Bing 站內 query 證據最多 5。新詞可為 0，但不能因此補造需求 |
| 一手證據與本站增值 | 0–20 | 至少一筆直接官方來源 8；第二個獨立官方來源 4；能做出台灣在地整理／跨賽事比較 4；所有重要主張可映射到來源或站內結構化資料 4 |
| canonical 與維護適配 | 0–10 | 更新既有高相關頁 10；新且明確不同意圖 6；維護責任不清 2；重複意圖 0 並強制改為 update |

### 扣分與拒絕

- 趨勢已 ended 且使用者任務也過期：-15；若仍有成績／結果需求，可轉成賽後更新。
- 搜尋意圖是直接購買，但本站不能交易或提供即時庫存：-15。
- 沒有在 24 小時內取得官方事實來源：hard reject 或維持 watch，不生成文章。
- 規則、成績、取消／延期、金額、法律／安全主張：不得直接自動發布，固定轉 PR。
- 內容只會重述趨勢 RSS 內的新聞摘要、沒有本站增值：hard reject。
- 建議一次只讓一個候選取得同一 intent／entity 的發布權，其他候選合併為 query aliases。

### 決策門檻

| 總分 | 動作 |
|---:|---|
| 80–100 | 進發布候選；仍須依風險分流，不代表一律直接上線 |
| 65–79 | 自動建立草稿 PR 或補資料待審，不直接發布 |
| 50–64 | watch 24 小時，等第二訊號（Related Rising、GSC 或官方公告） |
| 0–49 | 記錄後略過，保留拒絕理由供反思調整 |

## 五、內容選題與 URL 決策

決策順序固定如下：

```text
趨勢候選
  ├─ 已有相同事件／相同使用者任務？ → 更新既有頁
  ├─ 已有相近頁可增加一節就完整回答？ → 更新既有頁
  ├─ 是新事件且有官方公告？ → 建立／更新 events 資料；高風險欄位轉 PR
  ├─ 是跨事件、跨規則或資料整理，且提供獨特價值？ → 新文章草稿 PR
  └─ 只是熱門、沒有本站專業價值？ → 不發布
```

對賽事採單一 URL 生命週期：賽前更新報名／日期／地點，賽中更新官方狀態，賽後補官方成績。不要為「報名」「賽程」「成績」各開一個內容很薄的新 URL。這同時降低關鍵字互搶與維護成本。

標題可以使用真實搜尋用語，但不得為了 exact match 製造多個同義頁。Google 明確表示其語言理解能把頁面連到不同查詢，不需要為每個 query variation 建頁。

## 六、自動發布安全守門

### 發布分流

**A. 可直接自動發布：低風險既有頁更新**

同時符合以下條件才可 direct-to-main：

- score ≥ 80。
- `target_action=update_existing`，不新增 URL。
- 只使用已註冊的一手來源 adapter；來源 HTTP 成功、hash 已保存、`publisher`／`retrieved_at`／`trust_level` 完整。
- 不含姓名、聯絡資料、名冊、成績、取消／延期、規則解釋、價格或法律／安全結論。
- 變更屬模板可驗證欄位或既有文章的小幅補充，且 diff 在既有 reflect 上限內。
- 所有 gates 通過；來源檢查在此路徑應是 blocking，不可沿用 deploy 內「source-links 不擋部署」的寬鬆模式。

**B. 自動產生 PR：新文章或高風險更新**

- 新 `learn/` 文章。
- 新事件頁或新意圖 URL。
- 賽事成績、取消／延期、報名截止異動、規則與規格、價格與採購資訊。
- 來源互相衝突、只有二手報導、或候選含疑似個資。

現行 `check-content-budget.mjs` 會擋自動新增 learn 文章。趨勢流程不得在無人值守時設定 `ALLOW_NEW_LEARN=1`；第一階段應讓新文章停在 PR。若日後確定要開放，應新增專屬 trend collection/schema 與更嚴格 gate，而不是關掉現有守門。

**C. 永不自動發布**

- 未成年或選手個資。
- 無官方來源的傳聞。
- 把 Trends 熱度當成事件事實。
- 只改日期讓舊文看起來更新。
- 大量 query variations、改寫／拼接搜尋結果或低價值摘要頁。

Google 的 people-first 與 spam 政策都把「只因為熱門而寫」「大量自動產生低原創價值頁面」「為每個查詢變體建頁」列為應避免或可能構成 scaled content abuse 的做法。

### 機械 gates

發布前至少依序執行：

1. 工作樹與允許路徑檢查；不得夾帶其他自動流程的變更。
2. schema／frontmatter 驗證：`npm run check`。
3. 建置：`npm run build`。
4. 全測試：`npm test`。
5. 內容預算：`node scripts/check-content-budget.mjs`。
6. 本次新增／修改來源連結檢查，且趨勢發布路徑採 blocking。
7. 個資 NER 與明確 pattern 檢查。
8. canonical／slug／intent 重複檢查。
9. title、description、正文與 JSON-LD 的日期／地點／狀態一致性。
10. `lastmod` 只在正文、結構化資料或重要連結有實質更新時改變。
11. 建置產物 smoke test：URL 為 200、canonical 自指、沒有 `noindex`、站內連結可到達。

任何 gate 失敗：不 commit、不 push、不部署；保存候選與失敗原因，供 reflect 判斷是資料源、內容還是程式問題。

### 發布頻率與停損

- 第一階段每 24 小時最多 1 個新 URL、最多 3 個既有頁更新。
- 同一 entity／intent 設 24 小時鎖，避免 RSS 重複 item 造成連續改稿。
- 候選預設 7 天到期；賽事型由 event lifecycle 決定是否轉成賽後內容。
- 設全站 kill switch，以及來源別 circuit breaker：連續三次解析錯誤、空資料突增或來源 schema 改變時停發，只告警。
- direct-to-main 先經 20 個已審候選的 probation；precision 未達 80% 或發生一次錯誤事實／回退事故，就維持 PR-only。

## 七、發布後搜尋引擎通知

### Google

- 依現有 Astro sitemap 提供 canonical URL 與可信 `lastmod`；Google 明確說 sitemap 只是提示，不保證下載、crawl 或 index。
- 不對一般文章使用 Indexing API。官方文件限制它只能用於帶 `JobPosting` 或直播 `VideoObject` 中 `BroadcastEvent` 的頁面。
- Search Console URL Inspection API 用於檢查索引狀態；它不是一般內容的程式化「要求建立索引」API。
- 不因 48 小時未收錄就重複改日期或大量重送 sitemap。

### Bing 與其他 IndexNow 參與者

- 沿用部署後 `scripts/indexnow-submit.mjs`，只提交有實質更新且已上線的 URL。
- 保存回應碼，但 200／202 只代表收到；後續以 Bing Search Performance／URL Inspection 驗證 crawl 與 index。
- sitemap 仍是完整 URL 清單；IndexNow 是變更通知，兩者不能互相取代。

## 八、接入「數據 → 大腦 → 反思」

### 1. 數據層

建議沿用現有 collect 前後的時序，不另起會修改 repo 的平行程序：

- 每 30–60 分鐘：唯讀抓 Google Trends 台灣 RSS，append-only 保存 observation 與 raw hash。
- 每日 collect：沿用 GSC finalized 資料；另加一個 `hourly_all` 區塊，只供新發布頁 48 小時監看，並標示 incomplete。
- 每週：人工從 Google Explore Related Rising 與 Bing Keyword Research 匯入種子詞複核；取得 Trends API alpha 後才能改成正式 API。
- 每次判分前產生站內 content inventory：URL、entity、intent、更新日、索引狀態、近 7／28 天 GSC 與 Bing 指標。

建議資料位置：

```text
/root/seo-ops/state/twdro.net/trends/observations.ndjson
/root/seo-ops/state/twdro.net/trends/candidates.json
/root/seo-ops/state/twdro.net/trends/experiments.json
```

這些是營運狀態，不需進網站 repo；要供 brain 使用時，以受控 pre-command 產生只讀摘要。原始來源內容要存 hash 與必要欄位，不應整頁 rehost。

### 2. 大腦層

brain 每次只能從已通過 hard gates 的候選中選一個最高分項目，輸出以下其中一種明確動作：

- `update_existing`
- `create_draft_pr`
- `watch`
- `reject`

brain 不得自行補一個搜尋量、成長率、來源、日期或成績；缺資料只能降分或 watch。它必須先讀 content inventory，再決定新頁，且把 `candidate_id` 寫入 commit／PR metadata，才能回接成效。

現有 `brain.maxFiles=3` 與 gates 可繼續使用；新文章仍受內容預算守門。趨勢流程不應擴張 brain 對事實型 YAML 的一般寫入權限，資料更新應走已註冊 adapter 與對應風險分流。

### 3. 反思層

每次發布建立 experiment：

```json
{
  "experiment_id": "trend-2026-08-17-001",
  "candidate_id": "...",
  "score_version": 1,
  "action": "update_existing",
  "url": "https://twdro.net/events/.../",
  "commit": "git sha",
  "published_at": "...",
  "baseline": {"gsc_28d_impressions": 0, "gsc_28d_clicks": 0},
  "checkpoints": ["48h", "7d", "14d"]
}
```

反思規則：

- **48 小時**：只判斷技術面與早期訊號。確認 200、canonical、sitemap、Bing／Google 是否已發現；GSC hourly 資料須標 preliminary。不得因 0 impression 自動判死刑。
- **7 天**：用 finalized GSC 對比發布前相同星期區間；看 query cluster 與 URL 的 impressions、clicks、CTR。曝光增加但 CTR 低，優先檢查 title／description 是否準確；不要為了 CTR 寫誇張標題。
- **14 天**：決定 `scale`、`keep`、`revise`、`merge` 或 `stop`。GSC query rows 有匿名與截斷，不能把「查不到 query」直接視為絕對零需求。
- 低成效內容不自動刪除；若仍有明確使用者價值就保留。只有重複、過期且無持續價值、或錯誤頁才走合併／移除流程。
- 每 20 個 experiment 重算各分項對「獲得有效曝光／點擊」的命中率，調整分數權重；任何調權都升 `score_version`，舊實驗保留原版本。

建議 v1 成功定義不是固定的「流量三倍」，而是：

1. 候選 precision：人工審查判定值得發布的比例 ≥80%。
2. 來源安全：0 個無法追溯的重要事實、0 個個資事故。
3. 發布可靠：所有 direct-to-main 變更 gates 全綠，0 次緊急回退。
4. 搜尋結果：14 天內，相較同站其他同型頁，trend experiment 的中位 impressions／URL 較高；樣本不足時不做勝負結論。

## 九、建議實作順序

### Phase 0：只觀察（7 天）

- 接 Google Trends TW RSS，建立 observations 與 candidates。
- 每天產生排名與拒絕理由，不改 repo。
- 人工補一次 Google Explore Related Rising 與 Bing Keyword Research，校驗分數是否漏掉小眾詞。

### Phase 1：自動草稿（至少 20 個候選）

- 加 content inventory、canonical／intent 去重與官方來源 hard gate。
- score ≥65 才開草稿 PR；不 direct-to-main。
- PR 內附分數、趨勢來源、文章事實來源、目標 query cluster、既有頁比對與到期日。

### Phase 2：低風險既有頁自動更新

- 只開放 score ≥80、既有 URL、官方來源、低風險欄位。
- 每日上限、diff 上限、blocking source check、kill switch 全部生效。
- 部署後走 sitemap + IndexNow；Google 只監測，不用 Indexing API 推一般頁。

### Phase 3：是否開放新 URL 自動發布

只有 Phase 1／2 累積至少 20 個有效 experiment、候選 precision ≥80%、零來源事故、零回退事故，才評估。若開放，也只能針對明確 schema 的內容類型；不得以 `ALLOW_NEW_LEARN=1` 永久繞過內容預算。

## 本輪落地決策（2026-08-17）

使用者要求先完整執行一輪並建立可自動發佈的邏輯，因此實作採用比原始 Phase 1 更窄、但可直接驗證的例外：

- `scripts/trend-radar.mjs` 每日產生原始觀測與候選 JSON；Google Trends RSS 只作廣域熱門訊號，Google／Bing 建議字才是本輪小眾主題的交叉需求訊號。
- `scripts/check-content-budget.mjs` 仍預設禁止新增 `learn/`；只有當日唯一的 `decision=publish` 候選能對上 `trend_id`、日期／地點／場館短語、至少兩個來源與文章中的可點連結時才放行一篇。資料過期、候選重複或缺任何條件都回到 no-op。
- `events/`、`rules/`、`equipment/` 等事實 YAML 沒有加入自動白名單。文章只能引用既有已確認資料，不能因搜尋建議字自行創造賽事、報名、價格、成績或規格。
- 第一次實跑得到 `trend-2026-skycup-tainan`：Google／Bing 各有 3 個相關建議字；賽事距觀測日 12 天；RSS 有 10 個熱門項目但相關項目為 0；候選分數 10／10，來源為本站賽事頁與主辦單位 Facebook。已產出 `/learn/2026-skycup-tainan-guide/`，並將成效交給 48 小時、7 天、14 天觀察。
- 研究原案的「新文章先 PR」是低樣本期的保守基線；本輪改採單篇、當日、事實短語與來源都被機械驗證的自動例外。若後續出現錯誤事實、回退或候選 precision 低於 80%，立即把 `trendPublishing.enabled` 關閉，回到 PR-only／no-op。

## 十、官方引用

### Google Trends

- [Get started with Google Trends](https://developers.google.com/search/docs/monitor-debug/trends-start)
- [Explore the searches that are Trending now](https://support.google.com/trends/answer/3076011?hl=en)
- [Find related searches：Top、Rising 與 Breakout](https://support.google.com/trends/answer/4355000?hl=en)
- [FAQ about Google Trends data：抽樣、正規化、低量為 0 與雜訊](https://support.google.com/trends/answer/4365533?hl=en)
- [Export, embed, and cite Trends data](https://support.google.com/trends/answer/4365538?hl=en)
- [Google Trends BigQuery public dataset](https://support.google.com/trends/answer/12764470?hl=en)
- [Google Trends API alpha](https://developers.google.com/search/apis/trends)
- [Google Trends API alpha announcement](https://developers.google.com/search/blog/2025/07/trends-api)
- [Google Trends 台灣 Trending now RSS](https://trends.google.com/trending/rss?geo=TW)

### Google Search Console / Search Central

- [Search Analytics API query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Search Analytics API usage limits](https://developers.google.com/webmaster-tools/limits)
- [Search Analytics API hourly data](https://developers.google.com/search/blog/2025/04/san-hourly-data)
- [About Search Console data：延遲、匿名查詢與截斷](https://support.google.com/webmasters/answer/96568?hl=en)
- [Performance report dimensions and data groupings](https://support.google.com/webmasters/answer/17011259?hl=en)
- [Performance report common tasks](https://support.google.com/webmasters/answer/17010961?hl=en)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Spam policies：scaled content abuse](https://developers.google.com/search/docs/essentials/spam-policies)
- [Guidance for generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Indexing API quota and eligible content types](https://developers.google.com/search/apis/indexing-api/v3/quota-pricing)
- [Structured data introduction and validation](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)

### Bing Webmaster / IndexNow

- [Bing Keyword Research](https://www.bing.com/webmasters/help/keyword-research-628070b6)
- [Bing Search Performance](https://www.bing.com/webmasters/help/search-performance-c680da36)
- [Bing Webmaster API](https://learn.microsoft.com/en-us/bingwebmaster/)
- [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305)
- [Bing Sitemaps](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed)
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a)
- [IndexNow protocol documentation](https://www.indexnow.org/documentation)
- [IndexNow FAQ：收到通知不等於保證 crawl／index](https://www.indexnow.org/faq)

## 最終設計原則

這套流程的核心不是「自動寫更多」，而是「自動找到值得回答、本站有資格回答、能安全驗證的需求」。外部趨勢決定**何時值得看**，GSC／Bing 決定**是否真的有效**，官方來源決定**能不能發布**，而 repo 的 schema、測試、內容預算與 PR 分流決定**會不會傷害網站**。
