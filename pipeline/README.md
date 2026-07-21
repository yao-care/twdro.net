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

## 新增來源
在 `pipeline/sources/` 新增實作 `Source` 協定的 adapter（`fetch()`/`parse()`），
於 `pipeline/run.py` 的 `_load_source` 註冊，並在對應 workflow 呼叫。

## 邊界
- 不 rehost 官方 PDF（只存 URL + hash + retrieved_at）。
- 不爬社群/學校公告牆列表；遵守來源 ToS，不高頻爬取。
- 國際（`pipeline-intl`）adapter 仍為框架就緒、實際來源待接入。
