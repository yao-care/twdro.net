"""主辦單位官網文章監控 adapter：新文章出現即開 PR 通知人工。

為什麼需要這一支（2026-07-30）：
站主要求補上四場已結束天穹盃分站的 `results`（冠軍／亞軍／季軍）。實際查證後
**全臺沒有任何可爬取的網頁在公布無人機足球賽事成績**——包含主辦單位
台灣無人機競技發展協會（TDRUPA）自己的官網。已試過並排除：

- `tdrupa.org` 官網：SPA，內容走 `/api/articles`；實查 9 篇全是教學／親子／產品文，
  零成績內容。
- Facebook 粉專：`www` / `m` / `mbasic` 三個端點皆 HTTP 400，需登入態。
- Instagram `@tudrpa`：登入牆，HTML 內無任何貼文說明。
- YouTube（原民台等賽事新聞）：回機器人／同意頁，取不到說明欄。
- 新聞媒體（TDN 台灣生活新聞）、獎金獵人賽事頁、學校榮譽榜：只有簡章與參賽隊數。

結論是這屬**市場級缺口**，而不是漏找。既然目前拿不到，重點就從「再搜一輪」改成
「他們一發佈，我們隔天就知道」——否則這件事每個月都要重跑同一輪徒勞的搜尋。

設計取捨與安全邊界：
- **只偵測、不改寫**：成績屬事實型資料（站規鐵則 1），一律人工／PR 審核後上站。
  本 adapter 絕不寫 `src/content/events/`，只產 alert 供人工判讀。
- **只對「新文章」告警，不對內文編輯告警**：指紋只取 `(id, slug, title, publishedAt,
  category)`，刻意**丟掉文章本文**。否則協會修一個錯字就觸發告警，很快就沒人看了。
- **抗暫時性錯誤**：抓取失敗沿用上次已知清單，避免 5xx／逾時被誤判成「文章全刪」。
- **標示疑似成績文**：標題或分類命中成績關鍵字者在 alert 裡標 `looks_like_results`，
  讓人工一眼知道該不該立刻去補 events YAML。
"""
from __future__ import annotations
import datetime
import json
import os

import requests
import yaml

from pipeline.sources.base import Record

# 主辦單位官網的文章 API（SPA 的資料來源，公開、無需認證、回 JSON 陣列）。
# 可用 env ORGANIZER_ARTICLES_URL 覆寫；擴充其他主辦單位＝再加一個 URL。
DEFAULT_URL = "https://tdrupa.org/api/articles"

# 單一 alert 檔的 slug（穩定→覆寫；PR diff 即顯示這輪多了哪幾篇）。
ALERT_SLUG = "organizer-articles-alert"

# 疑似成績公告的關鍵字（命中即在 alert 標記，供人工優先處理）。
RESULT_KEYWORDS = ("成績", "冠軍", "亞軍", "季軍", "名次", "得獎", "賽果", "優勝", "獲獎", "榜")

# 指紋只取這些欄位——刻意排除文章本文，見模組 docstring。
FINGERPRINT_FIELDS = ("id", "title", "slug", "publishedAt", "category")


def _looks_like_results(article: dict) -> bool:
    haystack = " ".join(
        str(article.get(k) or "") for k in ("title", "category", "slug")
    )
    return any(kw in haystack for kw in RESULT_KEYWORDS)


class OrganizerArticles:
    name = "organizer_articles"
    out_dir = "pipeline/state/organizer-alerts"

    def __init__(self, url: str | None = None, content_root: str = ".") -> None:
        self.url = url or DEFAULT_URL
        # content_root 供測試指向暫存目錄；正式執行用 repo 根目錄（"."）。
        self.content_root = content_root

    def _prev_slugs(self) -> set[str]:
        """讀上一輪 alert 檔已知的文章 slug，用來算出「這輪多了哪幾篇」。"""
        path = os.path.join(self.content_root, self.out_dir, f"{ALERT_SLUG}.yml")
        try:
            with open(path, encoding="utf-8") as f:
                d = yaml.safe_load(f) or {}
        except Exception:
            return set()
        out: set[str] = set()
        for a in d.get("articles") or []:
            s = (a or {}).get("slug")
            if isinstance(s, str) and s:
                out.add(s)
        return out

    def fetch(self) -> bytes:
        """抓文章清單，回傳正規化後的 JSON bytes（只含指紋欄位、依 slug 排序）。

        抓取失敗時回上一輪的 slug 清單（欄位留空），使 hash 不變＝不誤觸告警。
        """
        try:
            r = requests.get(self.url, timeout=60,
                             headers={"User-Agent": "twdro-pipeline/1.0"})
            r.raise_for_status()
            payload = r.json()
        except Exception:
            prev = sorted(self._prev_slugs())
            return json.dumps([{"slug": s} for s in prev],
                              ensure_ascii=False, sort_keys=True).encode("utf-8")

        # API 可能回陣列，或包在 {"data": [...]} 裡——兩種都接。
        rows = payload if isinstance(payload, list) else (payload.get("data") or [])
        norm = [
            {k: row.get(k) for k in FINGERPRINT_FIELDS if row.get(k) is not None}
            for row in rows if isinstance(row, dict)
        ]
        norm.sort(key=lambda a: str(a.get("slug") or a.get("id") or ""))
        return json.dumps(norm, ensure_ascii=False, sort_keys=True).encode("utf-8")

    def parse(self, raw: bytes) -> list[Record]:
        """產出單一 alert Record（僅在文章清單指紋變更時被 orchestrator 呼叫）。"""
        articles = json.loads(raw.decode("utf-8"))
        prev = self._prev_slugs()
        today = datetime.date.today().isoformat()

        listed = []
        new_slugs = []
        for a in articles:
            slug = str(a.get("slug") or "")
            is_new = bool(slug) and slug not in prev
            entry = {
                "slug": slug,
                "title": a.get("title"),
                "published_at": a.get("publishedAt"),
                "category": a.get("category"),
                "is_new": is_new,
            }
            if _looks_like_results(a):
                entry["looks_like_results"] = True
            listed.append(entry)
            if is_new:
                new_slugs.append(slug)

        results_candidates = [
            e["slug"] for e in listed if e.get("is_new") and e.get("looks_like_results")
        ]
        data = {
            "detected_at": today,
            "source_url": self.url,
            "note": ("主辦單位官網文章清單有變。**本 alert 不改動站上任何資料。**"
                     "若有疑似成績公告（looks_like_results），人工核實後手動補進 "
                     "src/content/events/ 的 results 欄位——只填隊伍名，不得含選手個資。"),
            "new_count": len(new_slugs),
            "results_candidates": results_candidates,
            "articles": listed,
        }
        # free_text_fields 留空：只取標題/分類等中介資料，不涉個資，跳過 CKIP。
        return [Record(slug=ALERT_SLUG, data=data, raw=raw, free_text_fields=[])]
