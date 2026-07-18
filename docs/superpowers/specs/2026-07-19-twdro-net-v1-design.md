# twdro.net v1 設計文件

- 日期：2026-07-19
- 專案：台灣無人機足球資料與賽事平台（Taiwan Drone Soccer Hub）
- 網域：https://twdro.net
- Repo：https://github.com/yao-care/twdro.net （public）
- 本文件範圍：本次要建的靜態內容層。不做的項目在 §8 明列，不另設未來分期。

---

## 1. 定位與範圍

### 1.1 一句話定位

整合「賽事、規則、隊伍、場地、器材」的台灣無人機足球入口，以**結構化資料 + 明確來源標示**成為可長期引用的公共資料層。

### 1.2 本質

- **純靜態網站**，部署於 GitHub Pages，綁自訂網域 `twdro.net`。
- 所有「事實」是 repo 內的資料檔（YAML/Markdown），Astro 於 build 時 render 成靜態頁。
- 兩個互動工具（球機合規檢查器、規則比較器）以前端 JS（Astro Islands）實作，**不需要後端**。
- 資料以 **GitHub Actions pipeline 半自動取得**：自動「發現 + 存證 + 警示」，發佈一律經人工閘門。

---

## 2. 技術骨架

| 項目 | 決定 | 理由 |
|---|---|---|
| SSG | **Astro** | Content Collections（YAML/MD + schema 驗證）＋ Islands（局部互動不整站 SPA）同時吃下資料驗證與互動工具兩個需求 |
| 部署 | GitHub Pages + 官方 deploy action | 免費、與 public repo 天然整合 |
| 網域 | `CNAME` = `twdro.net` + DNS | 固定網域，SEO 與長期引用 |
| 樣式 | **單一全域 CSS**（design-tokens，OKLCH light theme） | 走既有固定規範；不使用 Astro scoped style |
| 搜尋 | Pagefind（build 時產索引，client-side 查） | 靜態站免後端全站搜尋 |
| 地圖 | MapLibre + OpenStreetMap | 前端，免金鑰 |
| 資料驗證 | Zod schema（`src/content.config.ts`） | build 時擋錯資料，接 pipeline 的命脈 |

### 2.1 視覺規範（design-tokens）

- 字級（最小 18px，無例外）：`--text-xs` 18 / `--text-sm` 20 / `--text-base` 24（正文）/ `--text-lg` 28 / `--text-xl` 32 / `--text-2xl` 48 / `--text-3xl` 56。
- 行高 1.6；字型堆疊 `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`。
- 配色 OKLCH light theme：背景 `#f5f6f8`、正文 `#1e2030`、連結 `#1e5ab8`、狀態色依 design-tokens `colors.md`。
- CSS 一律 `oklch()` + `@supports not` hex fallback。
- 無 dark mode（v1）。

---

## 3. Repo 與資料架構

### 3.1 目錄結構

```text
twdro.net/
├── CNAME                       # twdro.net
├── astro.config.mjs
├── public/
│   ├── styles/tokens.css       # 唯一全域 CSS
│   └── docs/                   # 只放我方原創文件；官方文件一律連外不 rehost
├── src/
│   ├── content/                # Astro Content Collections（Zod 驗證）
│   │   ├── events/
│   │   ├── rulebooks/
│   │   ├── rules/
│   │   ├── teams/
│   │   ├── venues/
│   │   ├── equipment/
│   │   ├── organizations/      # 學校/主辦主檔，避免重名
│   │   └── learn/
│   ├── components/
│   ├── islands/                # 合規檢查器、規則比較器、搜尋、地圖、日曆
│   ├── layouts/
│   ├── pages/                  # 路由，對應 §7 URL 結構
│   ├── lib/                    # schema、JSON-LD 產生器、同義詞表
│   └── content.config.ts
├── scripts/pipeline/           # fetch / normalize / scrub(CKIP) / diff / open-PR
└── .github/workflows/          # deploy.yml + pipeline-*.yml
```

### 3.2 三個關鍵設計決定

1. **每個 collection 一個 Zod schema。** pipeline 產出的 YAML 缺欄位或 enum 打錯 → build 直接失敗，錯資料進不了站。
2. **來源與驗證內嵌每筆資料**（不另建表）：每筆 event/rule 帶 `sources[]`（type/url/published_at/retrieved_at/trust_level/content_hash）與 `verification` 欄位。git log 即版本歷史。
3. **公開層邊界寫進型別**：`team` schema **不含**任何 player 個資欄位；`results` 只到隊伍名次。個資風險在型別層被擋掉。

### 3.3 URL = slug = 檔名

`src/content/events/2026-sky-cup-taipei.yml` → `https://twdro.net/events/2026-sky-cup-taipei`。永不出現 `?id=9382`。

### 3.4 v1 資料 collections

`events`、`rulebooks` + `rules`、`teams`、`venues`、`equipment`、`organizations`、`learn`。**無 `players`。** 僅建立有真實種子資料者。

### 3.5 關鍵 enum（沿用文件定義）

- `event.status`：draft / announced / registration_open / registration_closed / cancelled / postponed / ongoing / completed / results_pending / archived
- `verification`：unverified / community_submitted / source_confirmed / organizer_verified / official / disputed / outdated
- `trust_level`：A（第一手官方）/ B（官方轉知）/ C（可信二手）/ D（使用者提供）
- `rule_system`：FAI / FIDA / MOE（教育部）/ 各民間賽事 —— **各自獨立，嚴禁混用覆寫**

---

## 4. 資料 Pipeline

### 4.1 流水線

```
cron → fetch（HTML/PDF/開放資料）→ normalize（YAML 草稿）
     → CKIP NER（掃自由文字人名）
     → change detect（content_hash 比對）
     → 有變動：開 PR（draft + 標籤）
     → 【人工審核閘門】→ merge
     → Astro build（Zod 驗證）→ deploy Pages
```

**pipeline 只到「開 PR」為止；跨過 PR 人工閘門才會上站。** 自動化的是「發現 + 存證 + 警示」，發佈永遠有人。

### 4.2 GitHub Actions workflows

| workflow | 觸發 | 內容 |
|---|---|---|
| `deploy.yml` | push to main | Astro build（含 Zod 驗證）→ 發佈 Pages |
| `pipeline-gov.yml` | 每日 cron | 學校主檔、民航局法規（開放資料，A 級） |
| `pipeline-events.yml` | 每日 cron | 教育部/天穹盃公告、簡章 PDF 變更偵測 |
| `pipeline-intl.yml` | 每週 cron | FAI/FIDA 規則頁、國際賽事日曆 hash 監控 |

頻率對應文件 §18 更新表。

### 4.3 各來源自動化現實度

| 來源 | 自動化 | 做法 |
|---|---|---|
| 政府開放資料（學校、民航局） | 高 | open data/CSV/API 直抓，A 級 |
| FAI/FIDA 規則、賽事日曆 | 中 | HTML + hash 變更偵測；規則本文人工結構化 |
| 教育部/國教署公告、簡章 PDF | 中 | 自動發現新 PDF + 下載存證；內容萃取人審 |
| 學校公告系統 | 低 | 不爬；靠主辦/使用者投稿 |
| Facebook/社群 | 不做 | 違反 ToS、脆弱、法律風險 → 手動投稿 |
| 天穹盃等民間賽事 | 中 | 同賽事多來源聚合，半自動 |

**務實界線**：把「一份簡章 PDF」變成「結構化 event.yml」這步 v1 不全自動 —— pipeline 負責發現/存證/警示，欄位填對與規則體系判別由人（或 subagent）在 PR 內完成。

### 4.4 變更偵測（對應文件 §18.1）

官方 PDF/頁面存 `content_hash`。hash 變更時：開新版本、不覆寫舊版（git 天然）、PR 附 diff、規則頁顯示版本異動。

### 4.5 存證但不 rehost

抓到官方 PDF 記 URL + hash + retrieved_at 存證，前台連結原始官方文件，**不放進 public repo**（著作權，文件 §31.1）。只有我方原創文件進 `public/docs/`。

---

## 5. 個資防護（三層）

```
第 1 層｜schema 邊界    team 無 player 欄位 → 結構化個資進不來
第 2 層｜CKIP NER 警示  自由文字掃人名 → 標紅擋 PR
第 3 層｜人工審核閘門    merge 前必看，收斂成隊伍層級
```

### 5.1 CKIP 人名偵測層

- 工具：`ckip-transformers`（BERT-based，繁中/台灣專用 NER），跑在 `scripts/pipeline/` 的 Python 步驟；Actions 內**快取模型**（約 400MB）。
- 掃描對象：自由文字欄位（description、戰報、得獎名單原文）。
- 行為：偵測到 PERSON → **標紅 + 定位 + 擋自動 merge**，進審核佇列。**不自動塗改**（v1 量低，保留可稽核原文；未來量大再加降級塗改模式）。
- 定位為「安全網」，非唯一防線：NER 有漏抓（false negative），故人工閘門不可因有 CKIP 而移除。
- 官方承辦人（成人、職務公開）不靠爬取，由人工填入結構化 `official_contact` 欄位。

### 5.2 v1 個資政策（承 §1.3 決定）

- **完全不碰選手個資。** public repo 僅含賽事/規則/隊伍/場地/器材/組織。
- 得獎名單只到**隊伍層級**。
- 不做選手個人頁。

---

## 6. v1 頁面範圍

| 區塊 | v1 | 說明 |
|---|:--:|---|
| 首頁 | ✅ | 第一屏 + 內容區塊，資料驅動 |
| 認識無人機足球 | ✅ | `learn/` 入門文章 |
| 賽事：列表/日曆/地圖/詳細頁 | ✅ | 含資格/規則版本/球機規格/報名連結/隊伍/賽程/結果/來源。不含即時比分、線上報名 |
| 成績與排名 | ⚠️ | 只做單一賽事名次 + 隊伍歷史戰績呈現；不做全國積分排名、選手紀錄 |
| 隊伍：列表/地圖/詳細頁 | ✅ | 公開介紹、招募狀態、隊伍層級戰績；無隊員個資 |
| 選手與教練 | ❌ 不做 | 個資 + 需帳號 |
| 規則：總覽/各體系/比較器/規格 | ✅ | 核心。體系獨立不混。比較器 = island |
| 器材：球機庫/合規檢查器/比較 | ✅ | 核心。檢查器 = island |
| 學習 | ⚠️ | v1 入門/安全/器材/戰術文章 + 教材下載連結 |
| 場地與活動 | ✅ | 場地地圖 + 詳細頁 |
| 社群媒合 | ❌ 不做 | 需登入發文 |
| 新聞與內容 | ⚠️ | v1 最新消息/戰報靜態文章 |
| 主辦單位專區 | ❌ 不做 | 賽事管理 SaaS，需後端 |
| 會員中心 | ❌ 不做 | 需帳號 |
| 合作 | ✅ | 靜態說明頁 |
| 關於平台 | ✅ 必做 | 使命/編輯原則/資料來源/更正機制/條款/隱私/免責（法遵底線） |

### 6.1 互動 islands（5 個）

1. 球機合規檢查器　2. 規則比較器　3. 賽事日曆（篩選）　4. 賽事/場地地圖（MapLibre）　5. 全站搜尋（Pagefind）

### 6.2 SEO

- 固定可讀 URL（§3.3）。
- 結構化資料（build 時產 JSON-LD）：`Event` / `SportsEvent` / `Organization` / `SportsTeam` / `Place` / `Article` / `FAQPage` / `BreadcrumbList`。
- 同義詞導流：無人機足球 = 無人機飛球 = Drone Soccer；球機 = 無人機球 = Drone Ball。

---

## 7. 互動工具規格

### 7.1 球機合規檢查器（前端 island）

- 輸入：直徑、總重、馬達類型、電池電壓/容量、LED、前鋒辨識、防護罩、fail-safe、遙控頻段、來源品牌。
- 對照：使用者選定的賽事規則（`rulebook`）。
- 輸出：初步符合 / 部分欄位待確認 / 不符合 / 無法判定。
- **必附免責**：「此工具僅提供初步比對，最終資格以主辦單位與現場檢錄結果為準。」

### 7.2 規則比較器（前端 island）

- 使用者選多個 rulebook（如 FAI F9A-B 2026 / 教育部 115 年 / 天穹盃 2026 / FIDA）。
- 比較欄位：球機尺寸/重量、馬達、電池、場上人數、替補、每局時間、局數、前鋒識別、得分條件、球門/場地尺寸、檢錄、犯規/黃紅牌、暫停、平手處理。
- **嚴禁跨體系混用覆寫**；每欄標示規則版本與來源頁。

---

## 8. 不做的項目

- 自建金流、電商、影音串流。
- 爬 Facebook / 學校公告牆。
- rehost 官方規則 PDF 或未授權使用協會/賽事官方名稱。
- 全國積分排名。
- 選手公開個人頁、會員系統、線上報名、即時比分、伺服器端 AI 助理、原生 App、社群討論區、全國積分排名。

以上不在本次範圍。若日後要做，屆時另立文件討論，不在本文件預先分期。

---

## 9. 法律與隱私底線（v1 必須落地）

- 規則文件優先連結官方、不 rehost；中文翻譯標示是否官方，非官方翻譯加註免責。
- 未成年人：v1 不收選手個資（見 §5.2）。
- 比賽結果以主辦單位正式公告/官方成績表為準。
- 每個資料頁提供「回報資料錯誤」入口（v1 可用 GitHub Issue / 表單服務），並顯示資料來源與查核日期。
- pipeline 抓取遵守來源 ToS，不高頻爬取。

---

## 10. 開發順序

- **P0 地基**：Astro 專案 + design-tokens CSS + CNAME + deploy.yml；`content.config.ts` 定義 events/rulebooks/rules/teams/venues/equipment/organizations/learn 的 Zod schema。
- **P0 核心頁**：首頁、賽事列表/詳細/日曆、規則總覽/詳細、認識無人機足球、關於平台（含更正機制與法遵頁）。
- **P0 種子資料**：匯入第一批賽事（教育部 115 年各組、天穹盃各場）與規則（FAI F9A-B、FIDA、教育部）。
- **P1 資料庫 + 工具**：隊伍/場地/器材頁、合規檢查器、規則比較器、賽事地圖、Pagefind 搜尋。
- **P1 pipeline**：pipeline-gov / pipeline-events / pipeline-intl + CKIP scrub + 變更偵測 + 開 PR 流程。
- **P1 內容**：第一批入門文章（文件 §26.1 的 15 篇骨架）。

---

## 11. 成功條件

當使用者想到「哪裡有比賽 / 最新規則 / 我的球機能不能參賽 / 哪間學校有隊 / 過去誰得冠軍 / 哪裡能練」時，第一個想到並能在本平台找到結構化、標明來源的答案。
