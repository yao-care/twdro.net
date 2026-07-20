# twdro 資料 Pipeline

半自動資料取得：GitHub Actions 排程 → 抓取 → 正規化 → CKIP 人名偵測 → 變更偵測 → **開 PR**。
**pipeline 只到開 PR 為止；跨過人工審核閘門才會 merge 上站。**

## 三層個資防護
1. 目標 schema 無選手個資欄位（網站端）。
2. CKIP NER 掃自由文字人名 → PR 標紅、擋自動 merge（只標記不塗改）。
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
- **`moe_schools`**（`pipeline-gov`）：教育部統計處學校名錄 JSON → `organizations`。內建預設 URL（`stats.moe.gov.tw/j1_new.json`），可用 repo 變數 `MOE_SCHOOLS_URL` 覆寫。
- **`event_announcements`**（`pipeline-events`）：監看官方 HTML 公告頁，用「」括號＋競賽關鍵字（無人機/飛球＋錦標賽/公開賽/盃…）擷取賽事名稱與日期線索 → **draft 候選賽事**進 PR 給人審。監看清單見 `pipeline/sources/announcements.py` 的 `DEFAULT_URLS`，可用 repo 變數 `EVENT_ANNOUNCEMENT_URLS`（逗號分隔）覆寫。
  - 現實限制：FB/社群與 JS 渲染站不爬；學校公告頁易下架（404）。擷取為 best-effort，會有組別片段等雜訊，皆由人工在 PR 篩掉。擴充覆蓋＝加入新的穩定 HTML 頁。

## 新增來源
在 `pipeline/sources/` 新增實作 `Source` 協定的 adapter（`fetch()`/`parse()`），
於 `pipeline/run.py` 的 `_load_source` 註冊，並在對應 workflow 呼叫。

## 邊界
- 不 rehost 官方 PDF（只存 URL + hash + retrieved_at）。
- 不爬社群/學校公告牆列表；遵守來源 ToS，不高頻爬取。
- 國際（`pipeline-intl`）adapter 仍為框架就緒、實際來源待接入。
