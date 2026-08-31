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
3. **新增資料＝新增檔案，檔名即網址**，欄位由 `src/content.config.ts` 的 Zod schema 驗證
   （路徑與細節見 README 的「資料維護」）。
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

## 只寫在這裡的事（README 沒有的）

網站怎麼運作、資料放哪、健檢在防什麼、訂閱檔怎麼編碼——**全部在 [`README.md`](README.md)**，
這裡不重述。理由跟第一節同一條：同一件事寫兩份就會各走各的，而改寫過的重複連 diff 都抓不出來。
下面只留 README 沒有、又是維護時會踩到的東西。

### 新增 `learn/` 文章預設被擋

人工要加時帶 `ALLOW_NEW_LEARN=1` 執行 `scripts/check-content-budget.mjs` 即可放行；自動層則必須
讓新檔 frontmatter 的 `trend_id` 對上 `seo-data/trends/` 最新 JSON 中 `decision=publish` 的候選，
且每天最多一篇。理由與當初的量測見該檔檔頭——**規則只寫在 playbook 會被下一個 session 忽略，
必須進機械層才有效**。

### 兩支 pipeline 不能排同一個時間

都會寫 `pipeline/state/manifest.json` 並開 PR，同時跑會互相覆蓋。加新排程前先跑上面
「監看來源的覆蓋率」那組 `grep cron` 看現有時段。

### `scripts/index-watch.mjs` — 收錄狀態監測

掃全站收錄狀態 → 落盤累積歷史 → 對卡住超過門檻天數的發 Slack 告警。門檻與旗艦頁等常數見該檔頂部
（`STUCK_DAYS`、`REALERT_DAYS`、`MAX_PER_RUN`、`INSPECT_CONCURRENCY`、`FLAGSHIP`）。
由 seo-ops 的每日 cron 呼叫（`/mnt/customers/seo-ops/sites/twdro.net.json`），不在 GitHub Actions 裡。

**2026-08-31 起每日自動推送 Indexing API 已停用**，掃描與告警照舊。停用的依據是檔頭那段反證：
有網址連續 27–33 天天天推送成功、狀態仍是「Google 不知道」且從未被爬——**「成功」不等於「有效」**，
每天送 100+ 筆換不到可觀測的收穫，卻讓自動化看起來有在做事，掩蓋真正的槓桿（內鏈、外部曝光、時間）。
要推得顯式加旗標：

```bash
node scripts/index-watch.mjs            # 掃描 → 落盤 → 告警（每日 cron 走這條，不推送）
node scripts/index-watch.mjs --push     # 同上，並推送未收錄網址＋旗艦頁
node scripts/index-watch.mjs --all      # 不查狀態，推 sitemap 全部（人工判斷後才用）
node scripts/index-watch.mjs <url>...   # 只推指定網址
```

**告警是「有變化就發，沒變化也每 `REALERT_DAYS` 天重提一次」**。原本只在清單有變化時發，
實際效果是問題愈持久愈安靜——那 23 筆卡了 13–41 天、清單一直沒變，Slack 從某天起就不再提起。
每天吵是噪音，永遠不吵是失明。

配額要改先跑 `node /mnt/customers/seo-ops/bin/gsc-permission-audit.mjs`——`MAX_PER_RUN` 是
「本站在 GCP 專案 yaocare 裡分到多少」，不是全部配額，這個誤解已經害人掐錯一次。

### `scripts/trend-radar.mjs` — 外部搜尋趨勢雷達

只產 `seo-data/trends/YYYY-MM-DD.json`，不改事實型 YAML、不直接發佈文章。三種訊號拆開留痕
（Google Trends、Google 建議字、Bing 建議字）；Trending Now 對臺灣可能回報 unsupported，
**不能當唯一資料源**。

### `seo-data/` 不進版控

`.gitignore` 排除整個目錄，落盤資料只存在這台機器上。所以收錄歷史、趨勢候選**沒有備份**，
換機器就從零開始累積。

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
