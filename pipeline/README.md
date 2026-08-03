# twdro 資料 Pipeline

自動資料取得：GitHub Actions 排程 → 抓取 → 正規化 → CKIP 人名偵測 → 變更偵測 → **分流**。
**2026-07-21 起改為「能自動就自動、踩到個資才停」**（原本一律開 PR 人審）：

- **未偵測到人名的候選** → 由 `pipeline/ci/auto-merge.sh` 直接 commit 進 `main`
  自動上站（push main 觸發 `deploy.yml` 部署）。
- **偵測到疑似選手姓名的候選** → 只寫入 `pr-body.md`/`pr-paths.txt`，由
  `peter-evans/create-pull-request` 開 PR 給人審，**絕不自動上站**（收斂成隊伍層級後才 merge）。

`run.py` 依 CKIP 結果分流，寫出三個 CI 用暫時檔（`.gitignore` 排除、`manifest.json` 仍追蹤）：
`pipeline/state/auto-paths.txt`（自動併 main 的路徑，含 manifest）、`pr-paths.txt`、`pr-body.md`。

> ⚠️ 賽事草稿自動上站後，站上 `/events` 會以 **「草稿／未驗證」** badge 誠實顯示
> （`status: draft` + `verification: unverified`）。若要改成「草稿不公開、人工升級 status 才顯示」，
> 在 `src/pages/events/index.astro`（及 `[slug].astro`/`calendar.astro`）過濾掉 `draft` 即可。

> ⚙️ 「開 PR」路徑需 repo 設定 **Settings → Actions → General → Workflow permissions →
> 勾選「Allow GitHub Actions to create and approve pull requests」**（否則 create-pull-request 會
> 報 `GitHub Actions is not permitted to create or approve pull requests`）。乾淨自動上站路徑不需要此開關。

## 三層個資防護（仍是硬邊界）
1. 目標 schema 無選手個資欄位（網站端）。
2. CKIP NER 掃自由文字人名 → **導向 PR 人審、擋自動上站**（只標記不塗改）。
3. 人工在 PR 審核收斂成隊伍層級。

## 本地開發／測試
```bash
python3 -m pip install -r pipeline/requirements-dev.txt   # 不含 torch
python3 -m pytest -q                                      # 離線，scrub 用 mock NER
```

## 正式執行（CI）
`pipeline/requirements.txt` 含 `ckip-transformers` + `torch`（僅 CI 安裝）。
workflow：`pipeline-gov`（每日）、`pipeline-events`（每日）、`pipeline-intl`（每週）。

## 已接的來源
- **`moe_schools`**（`pipeline-gov`）：教育部統計處學校名錄 JSON。**2026-07-21 起只 enrich「有隊伍的學校」**——掃 `teams/*.yml` 的 `organization` 欄找出被指到、且 `org_type=school` 的既有 `organizations`，只替**缺 `city`／`website`** 者自動補齊官方資料（既有值不覆蓋、絕不新增學校）。無隊伍對應或資料已齊 → no-op。內建預設 URL（`stats.moe.gov.tw/j1_new.json`），可用 repo 變數 `MOE_SCHOOLS_URL` 覆寫。
  - 為何不整批列校：名錄一抓就是整份（國中 700+ 所），全數落地會灌爆 `organizations` 且與無人機足球無關。真正有值的是替既有隊伍所屬學校補官方 city/官網。
- **`event_announcements`**（`pipeline-events`）：監看官方 HTML 公告頁，用「」括號＋競賽關鍵字（無人機/飛球＋錦標賽/公開賽/盃…）擷取賽事名稱與日期線索 → **draft 候選賽事**。乾淨者自動上站（草稿標示）、疑含人名者才開 PR。監看清單見 `pipeline/sources/announcements.py` 的 `DEFAULT_URLS`，可用 repo 變數 `EVENT_ANNOUNCEMENT_URLS`（逗號分隔）覆寫。
  - 現實限制：FB/社群與 JS 渲染站不爬；學校公告頁易下架（404）。擷取為 best-effort，會有組別片段等雜訊——上站後以「草稿／未驗證」標示，人工再升級 status 或修正。擴充覆蓋＝加入新的穩定 HTML 頁。
  - **2026-07-23 起兩層降噪**：(1) **來源 URL 去重**——候選來源頁若已被任何非 draft 賽事引用（那頁的賽事已人工建檔），一律跳過，避免重複草稿；(2) **雜訊過濾**——公文句型（旨揭/檢送/為推廣…）與規格/組別片段（有刷/無刷馬達…組）不產候選。故監看頁的賽事一旦人工建檔並在其 `sources` 引用該 URL，adapter 對該頁即成 no-op，只對「尚未建檔的新頁」有值。
- **`fai_fida_rules`**（`pipeline-intl`）：監看 FAI／FIDA 官方規則頁（HTML 與規則書 PDF 皆可，以位元組 sha256 當**指紋**）。任一頁指紋變更 → 產生一份 `pipeline/state/intl-alerts/rule-change-alert.yml`（含各頁 URL＋指紋）並**開 PR 通知人工比對**，PR 一併帶入 manifest bump（merge 後收斂、不重複告警）。**只偵測、不改寫**：絕不自動併 main、不自動改寫 rulebooks/rules（官方規則權威性）。抓取失敗沿用上次指紋，避免暫時性錯誤誤觸。監看清單見 `pipeline/sources/intl_rules.py` 的 `DEFAULT_URLS`，可用 repo 變數 `INTL_RULE_URLS`（逗號分隔）覆寫。因不涉個資，workflow 用 `requirements-dev.txt`（免裝 torch/CKIP）。

- **`organizer_articles`**（`pipeline-organizer`，每日 05:30 台北）：監看主辦單位官網的文章 API（`https://tdrupa.org/api/articles`，SPA 的資料來源，公開免認證；可用 repo 變數 `ORGANIZER_ARTICLES_URL` 覆寫）。**出現新文章 → 開 PR 通知人工**，alert 內把疑似成績公告標成 `results_candidates`。**只偵測、不改寫**：絕不自動併 main、絕不動 `src/content/events/`。
  - **為什麼需要**（2026-07-30）：站上四場已結束的天穹盃分站沒有 `results`，而實查後**全臺沒有任何可爬取的網頁在公布無人機足球賽事成績**——已排除協會官網（9 篇全是教學／親子／產品文，零成績內容）、Facebook 粉專（`www`/`m`/`mbasic` 三端點皆 HTTP 400，需登入態）、Instagram `@tudrpa`（登入牆）、YouTube 賽事新聞（機器人／同意頁，取不到說明欄）、新聞媒體（TDN 只報參賽隊數）、獎金獵人（只有簡章）、學校榮譽榜（全是報名轉知）。**這是市場級缺口，不是漏找**——所以重點從「再搜一輪」改成「他們一發佈，隔天就知道」。
  - **指紋刻意排除文章本文**，只取 `(id, title, slug, publishedAt, category)`：否則協會修一個錯字就觸發告警，很快就沒人看了（有回歸測試守門）。抓取失敗沿用上次 slug 清單，避免 5xx 被誤判成「文章全刪」。
  - **首次執行會把現有 9 篇全報成新文章**（沒有基準檔），merge 那個 PR 即建立基準，之後只報真正的增量。
  - ⚠️ **2026-08-03 更正上一條的適用範圍**：「全臺沒有任何可爬取的網頁在公布成績」對**天穹盃系列**仍成立，但**不適用於縣市層級**——縣市政府教育處一直在公告成績，只是先前沒有人在看。見下一支 `county_edu_news`。

- **`county_edu_news`**（`pipeline-county`，每日 06:00 台北）：監看縣市教育網／學校公告，出現無人機足球相關標題即開 PR。來源清單走設定檔 `pipeline/sources/county_feeds.yml`（可用 `COUNTY_FEEDS_CONFIG` 覆寫），**加縣市不必改程式**。同樣**只偵測、不改寫**。
  - **為什麼需要**（2026-08-03）：查 GSC 建議字挖到的具體查詢「無人機足球比賽嘉義縣蒜頭國小」時發現，嘉義縣政府教育處教學發展科 2026-05-29 就公告過成績（trust_level A）。站上第一筆賽事成績 `events/2026-chiayi-county-selection` 即由此補上，同輪還從地方新聞補到第二筆 `events/2026-yunlin-county-cup`。**這件事不該每個月靠人想到才手動搜一次。**
  - **覆蓋率目前只有嘉義縣**，且這是誠實的現況而非疏漏：各縣市教育網不是同一套 CMS。嘉義走 XOOPS `tadnews`，`/modules/tadnews/rss.php` 直接回 20 筆 RSS（已驗證）；新竹／南投／新北是另一套（`/p/406-1001-<id>.php` 型），實測 `/app/index.php?Action=rss`、`/p/rss-*.php`、`/rss.php` 皆不存在，首頁也找不到可穩定解析的清單頁。adapter 已備好 `html` 模式（可設 `link_re` 濾導覽列），找到清單頁即可直接補進設定檔。未納入的縣市與原因寫在 `county_feeds.yml`。
  - **主題篩選必須在 `fetch()` 做，不能只在 `parse()` 做**（首次實跑才發現的缺陷）：縣市教育網每天都在發代理教師甄選公告，若把全部公告放進 payload，變更偵測的 hash 天天變 → 每天開一個 `matched: []` 的空 PR，一週內就沒人看。已有回歸測試 `test_unrelated_announcements_do_not_change_the_hash` 守門。
  - **人工核實時務必看中文原文**：2026-08-03 實例——英文摘要把「景山國小」羅馬拼音成 Jingshan，回推時極易誤寫為「靜山國小」。PR 內文的審核步驟已寫明這一條。

## 新增來源
在 `pipeline/sources/` 新增實作 `Source` 協定的 adapter（`fetch()`/`parse()`），
於 `pipeline/run.py` 的 `_load_source` 註冊，並在對應 workflow 呼叫。

## 邊界
- 不 rehost 官方 PDF（只存 URL + hash + retrieved_at）。
- 不爬社群/學校公告牆列表；遵守來源 ToS，不高頻爬取。
- 國際規則（`pipeline-intl` / `fai_fida_rules`）只做**指紋變更偵測＋開 PR**，不 rehost、不自動改寫官方規則；站上 rulebooks/rules 一律人工比對後手動更新。
