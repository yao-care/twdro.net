# CLAUDE.md — twdro.net 維護手冊

臺灣無人機足球資料與賽事平台。Astro 靜態站，資料由 `src/content/` 的 YAML／Markdown 驅動，
push `main` 自動建置並發佈至 GitHub Pages（`https://twdro.net`）。

---

## 這份文件的第一條規則：不留現況數字

**凡是「跑一行指令就能問出來的當下狀態」，這份文件只留指令，不留數字。**
賽事幾筆、收錄幾頁、哪幾支健檢在紅、爬蟲配額用掉多少——一律去問系統，不要相信文件。

寫死的數字會過期，而過期的文件比沒有文件更危險：它讓人**有依據地做錯決定**。
本站已經吃過一次——`scripts/index-watch.mjs` 的 `MAX_PER_RUN` 註解記著，2026-08-21 有人
依一段舊敘述以為 `folk.tw` 還在跟本站搶同一個 GCP 專案配額，把兩邊都掐小，
而 `folk.tw` 前一天就搬走了。**兩邊都被一段沒人維護的文字綁住。**

編輯這份文件時：

| 這類東西 | 怎麼寫 |
|---|---|
| 現在有幾筆／幾頁／幾％／幾分 | ❌ 不寫數值 → ✅ 寫取得它的指令 |
| 程式裡的常數（門檻、上限、逾時） | ❌ 不複製數值 → ✅ 指到它的出處（檔名＋變數名） |
| 帶日期的歷史事故與當時的觀測值 | ✅ 可以寫，但**必須標日期**，並寫清楚它是紀錄不是現況 |

第二欄的理由是一樣的：把常數抄過來，就等於製造了第二個會脫節的事實來源。

---

## 站規鐵則

1. **賽事與成績是事實型資料，一律人工核實後手動上站。** 監看 pipeline **全部只偵測不改寫**，
   產出候選並開 PR，沒有任何一支可以自動併入 `main` 或改寫 `src/content/events/`。
2. **`teams` 不得加入選手個資欄位。** schema 層就沒有這些欄位，pipeline 另有 NER 掃描擋自動上站
   （見 `pipeline/README.md`）。
3. **新增資料＝新增檔案，檔名即網址。** 所有欄位由 `src/content.config.ts` 的 Zod schema 驗證，
   缺欄位或狀態值錯誤會讓 build 失敗。
4. **查不到來源就別讓欄位停在推測值。** 每一筆資料都要標來源網址。
5. **要靜音一個健檢告警，唯一的方式是把資料修好**——健檢刻意不提供豁免清單。

---

## 現況查詢：問系統，不要問文件

### 站上現在有什麼

```bash
# 各集合筆數
for d in src/content/*/; do printf '%6s  %s\n' \
  "$(find "$d" -type f \( -name '*.yml' -o -name '*.md' \) | wc -l)" "$(basename "$d")"; done

# 賽事狀態分佈
grep -h '^status:' src/content/events/*.yml | sort | uniq -c | sort -rn

# 沒有任何來源的賽事（應為 0；非 0 就是 check-event-status 會抓的那批）
grep -L 'sources:' src/content/events/*.yml

# 已標記「原公告已下架」的資料
grep -rl 'unavailable_since' src/content/
```

### 線上網站現在長什麼樣

```bash
# sitemap 總網址數
curl -s https://twdro.net/sitemap-0.xml | grep -o '<loc>' | wc -l

# 各分區佔多少（判斷爬取預算被誰吃掉，就看這張表）
curl -s https://twdro.net/sitemap-0.xml | grep -o '<loc>[^<]*' \
  | sed 's|<loc>https://twdro.net/||' | awk -F/ '{print ($1==""?"(root)":$1)}' \
  | sort | uniq -c | sort -rn
```

### 搜尋引擎收錄到哪了

```bash
# 落盤的收錄狀態統計 + 最後一次卡住告警（離線讀，不打 API）
python3 -c "
import json,collections
h=json.load(open('seo-data/coverage/history.json')); u=h['urls']
print('追蹤網址:',len(u),'/ 最後告警:',(h.get('lastAlert') or {}).get('date'))
for s,n in collections.Counter(v['state'] for v in u.values()).most_common(): print(f'  {n:4d}  {s}')
"

# 重新掃線上狀態並印報告（不推送、不告警）
node scripts/index-watch.mjs --report

# 各站在 GCP 專案 yaocare 的配額實際怎麼分（改 MAX_PER_RUN 前必跑）
node /mnt/customers/seo-ops/bin/gsc-permission-audit.mjs
```

### 監看來源的覆蓋率

```bash
# 縣市 RSS：接上幾個縣市、幾個 feed
python3 -c "
import yaml
f=yaml.safe_load(open('pipeline/sources/county_feeds.yml'))['feeds']
c=sorted({x['label'][:3] for x in f})
print(f'{len(c)} 縣市 / {len(f)} feed'); print(' '.join(c))
"

# 新聞與成績頁：幾個來源、各是什麼模式
python3 -c "
import yaml,collections
s=yaml.safe_load(open('pipeline/sources/news_queries.yml'))['sources']
print(len(s),'筆', dict(collections.Counter(x['mode'] for x in s)))
for x in s: print(' ', x['mode'], '|', x['label'])
"

# 有哪幾支 pipeline、各自幾點跑（cron 是 UTC，台北 = +8）
ls .github/workflows/pipeline-*.yml
grep -H 'cron:' .github/workflows/pipeline-*.yml
```

### 測試與健檢現在過不過

```bash
npm test                              # vitest（tests/）
python3 -m pytest -q                  # pipeline（tests_py/，離線）
ls tests/*.test.ts | wc -l            # 有幾組守門測試
node scripts/check-source-links.mjs   # 來源網址健檢，有失效則 exit 1
node scripts/check-event-status.mjs   # 賽事狀態健檢，有問題則 exit 1
node scripts/check-content-budget.mjs # 內容預算守門
```

---

## 開發

```bash
npm install
npm run dev      # 本地預覽
npm run build    # astro build && pagefind --site dist
npm run check    # astro check
npm test         # vitest
```

Node 版本要求見 `package.json` 的 `engines`。

## 資料維護

| 內容 | 路徑 |
|---|---|
| 賽事 | `src/content/events/<slug>.yml` |
| 規則 | `src/content/rulebooks/`、`src/content/rules/` |
| 隊伍／場地／器材／組織 | `src/content/` 對應子目錄 |
| 文章 | `src/content/learn/<slug>.md` |

**新增 `learn/` 文章預設被擋。** 人工要加時帶 `ALLOW_NEW_LEARN=1` 執行健檢即可放行；
自動層則必須讓新檔 frontmatter 的 `trend_id` 對上 `seo-data/trends/` 最新 JSON 中
`decision=publish` 的候選，且每天最多一篇。理由與當初的量測見
`scripts/check-content-budget.mjs` 檔頭——**規則只寫在 playbook 會被下一個 session 忽略，
必須進機械層才有效**。

## 部署

`.github/workflows/deploy.yml`：build → test → 上線 → IndexNow。**測試不過不會部署。**
`source-links` 與 `event-status` job 平行跑資料健檢，**不擋部署**但失敗會讓 workflow 標記失敗。
跑哪些 job 以 `grep -n 'run:' .github/workflows/deploy.yml` 為準。

⚠️ **checkout 必須 `fetch-depth: 0`**——sitemap 的 lastmod 對「沒有日期欄位的內容檔與靜態頁」
退回讀 git commit 日期，淺層 clone 拿不到歷史，那些頁會**無聲失去 lastmod**。

---

## 資料健檢：每一支對應一種「不會讓 build 失敗」的壞法

有哪幾支以 `ls scripts/check-*.mjs` 為準。共同前提：**壞掉時頁面照樣渲染、build 照樣過、測試照樣綠**，只有真的去點的人才發現，
而會去點的正是我們最想說服的那群人。

### `check-source-links.mjs` — 來源網址失效
學校公告下架、換網址是常態。
- 403／406 等視為「對方擋機器人」，不算失效。
- Facebook 等社群平台列為「無法自動驗證」，需人工複查。
- DNS 查不到 ≠ 網域消失，別把活著的來源標成已下架（見 commit `7275dbf`）。
- 確認永久下架又暫無替代的，在該筆來源加 `unavailable_since: "YYYY-MM-DD"`：頁面會標明
  「原公告已下架」並保留網址供追溯，健檢降級成提醒但每次執行都印出來。
  **標註寫在資料裡而非另一份清單**——清單會與資料脫節，而「這個來源掛了」本來就是資料的一部分。
  若該網址日後復活，健檢會提醒把欄位刪掉，避免畫面一直對讀者說謊。

### `check-event-status.mjs` — 賽事狀態與來源
賽事是站上最有時效性的東西，兩種無聲壞法：
- **狀態沒跟著日期走**：狀態仍是 `announced`／`registration_open`／`ongoing`／`postponed`
  但賽期已過 → 畫面會把打完的比賽排進「即將舉行」。
- **整頁沒有任何來源**：而 `verification` 只在有來源時才顯示，於是**最沒有依據的頁面反而最安靜**。

賽事頁本身也會在「無來源或 `verification: outdated`」時直接對讀者說明，並附回報入口。

### `check-content-budget.mjs` — 內容預算
擋下自動層新增教育文。詳見上面「資料維護」與該檔檔頭。

---

## 每天檢查有沒有新資料

賽事與成績不會有人通知我們，只能自己每天去看。每支 pipeline 各盯一類來源（清單以
`ls .github/workflows/pipeline-*.yml` 為準，下表說明各自的職責）：

| workflow | adapter | 盯什麼 |
|---|---|---|
| `pipeline-gov` | `moe_schools` | 教育部統計處學校名錄，只 enrich「有隊伍的學校」 |
| `pipeline-events` | `event_announcements` | 固定的賽事公告頁 |
| `pipeline-intl` | `fai_fida_rules` | FAI／FIDA 官方規則頁與 PDF（指紋比對） |
| `pipeline-organizer` | `organizer_articles` | 主辦協會官網文章 API |
| `pipeline-county` | `county_edu_news` | 縣市政府／教育網 RSS |
| `pipeline-news` | `news_watch` | 新聞媒體 ＋ 主辦單位自架的成績頁 |

實際排程時間、來源覆蓋率請跑上面「監看來源的覆蓋率」那組指令。各 adapter 的設計理由、
已實測失敗的端點、降噪規則全部寫在 `pipeline/README.md` 與各來源設定檔的檔頭註解裡。

```bash
python -m pipeline.run --source news_watch          # 本機跑一輪
gh workflow run "Pipeline · 新聞與主辦單位公告監看"   # 立刻觸發一輪
```

**加一個查詢或一個頁面不必改程式**——來源清單走設定檔（`pipeline/sources/*.yml`）。

⚠️ **排程時間只是「不早於」。** 實測 2026-08-27：GitHub 對這個 repo 的排程平常延遲
24–30 分鐘，那一天四支全部被延遲 169–299 分鐘。延遲不要緊（還是同一天），真正的風險是
GitHub 在高載時**整個丟掉**排程執行，而且不會有任何錯誤訊息——那會讓「每天檢查」悄悄變成
「有時候檢查」。`pipeline-news` 因此在同一天排了不只一次當保險（實際次數見上面的 `grep cron`）；
`create-pull-request` 重用同一個分支，重複跑只會更新同一個 PR，不會產生重複 PR。

⚠️ **兩支 pipeline 不能排同一個時間**：都會寫 `pipeline/state/manifest.json` 並開 PR，
同時跑會互相覆蓋。加新排程前先跑上面的 `grep cron` 看現有時段。

---

## 搜尋引擎收錄

- **sitemap `<lastmod>`**：由 `src/lib/lastmod.mjs` 依內容本身的 `updated_at`／`retrieved_at` 產生，
  沒有日期欄位的集合（venues／organizations）與靜態 `.astro` 頁退回該檔的 git commit 日期。
  **不蓋建置時間**——假訊號會被搜尋引擎學會忽略。
- **IndexNow**：部署後 `scripts/indexnow-submit.mjs` 讀線上 sitemap，只推 lastmod 三天內的網址。
  金鑰檔 `public/be644c81fe9010bea60de485d1544bf2.txt` 必須隨站部署，刪掉推送會全部失效。
  本機驗證：`node scripts/indexnow-submit.mjs --local --dry-run`。
- **Google 不參與 IndexNow**：Google 端只有 sitemap lastmod 與 Search Console 手動
  「要求建立索引」兩個手段。
- **`scripts/index-watch.mjs`**：掃全站收錄狀態落盤累積歷史 → 對尚未收錄的送 Indexing API →
  對卡住超過門檻天數的主動發 Slack 告警。門檻、配額上限、旗艦頁清單等常數見該檔頂部
  （`STUCK_DAYS`、`MAX_PER_RUN`、`INSPECT_CONCURRENCY`、`FLAGSHIP`）。

  這支存在的理由值得先讀檔頭：推送**只對「Google 還不知道這個網址」有效**，對「已被發現、
  只是還沒排到爬」的頁完全無效，反覆把它們補進推送清單是白做工。收錄與否有相當部分不在站方
  控制內（新站爬取預算），**能徹底解決的不是「讓它歸零」，而是「不要再靠 Google 寄信才知道」。**

  前置（一次性，已完成）：GCP 專案啟用 Web Search Indexing API；服務帳號在 Search Console
  須為**擁有者(Owner)**——「完整(Full)」不夠，Indexing API 只認擁有者。

- **`scripts/trend-radar.mjs`**：外部搜尋趨勢雷達，只產 `seo-data/trends/YYYY-MM-DD.json`，
  不改事實型 YAML、不直接發佈文章。三種訊號拆開留痕（Google Trends、Google 建議字、Bing 建議字）；
  Trending Now 對臺灣可能回報 unsupported，**不能當唯一資料源**。

- 守門在 `tests/sitemap-lastmod.test.ts` 與 `tests/trailing-slash.test.ts`——這兩組各對應一次
  真實的收錄事故。

---

## 訂閱來源（RSS／iCalendar）

站上最有時效性的是**報名截止日**與**成績公布**，但讀者看過一次之後沒有任何機制把他叫回來。
訂閱檔就是那個機制，隨站部署、無後端。

- `/rss.xml`（`src/pages/rss.xml.ts`）：news 公告 ＋ 全部公開賽事。賽事的 `pubDate` 取各來源
  `retrieved_at` 的最大值（＝我方最後確認日，與 sitemap lastmod 同一套語意）。
  全站 `<head>` 有 `rel="alternate"` 宣告，閱讀器才發現得到。
- `/events/calendar.ics`（`src/pages/events/calendar.ics.ts`）：每場賽事產出賽期 VEVENT，
  **有 `registration_end` 的另外產一筆「報名截止」**——那才是訂閱的主要理由。
  UID 跨次建置穩定（`event-<slug>@twdro.net`），否則訂閱者的日曆會不斷長出重複事件。

編碼規則集中在 `src/lib/feed.ts`：iCalendar 每行有位元組上限（中文一字 3 bytes，按長度切會超標、
按 byte 硬切會把字剖成兩半）、行尾一律 CRLF、全天事件 DTEND 排他 +1 天。**這些壞掉時檔案照樣產生、
build 照樣過、畫面看不出來**，所以 `tests/feeds.test.ts` 逐條釘在建置產物層。

---

## 相關文件

| 文件 | 內容 |
|---|---|
| `README.md` | 對外說明：這個站是什麼、資料怎麼維護 |
| `pipeline/README.md` | 各 adapter 的設計理由、個資防護、已實測失敗的端點清單 |
| `pipeline/sources/*.yml` | 來源清單本身，檔頭註解記著「為什麼是這些、為什麼不是那些」 |
| `docs/superpowers/` | 2026-07-19 的原始設計 spec 與 plan（**歷史文件，不隨現況更新**） |
| `docs/research/` | 帶日期的研究筆記（同上，是紀錄不是現況） |
| `/mnt/customers/seo-ops/sites/twdro.net.json` | 本站在 seo-ops 的設定與 brain gates |

註解密度在這個 repo 偏高是刻意的：**大部分規則的成本不在「怎麼做」而在「為什麼是這樣」**，
而那個理由通常是一次真實事故。刪註解前先確認那次事故不會再發生。
