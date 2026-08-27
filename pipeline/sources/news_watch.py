"""每日新聞與主辦單位公告監看：出現沒看過的無人機足球相關標題就開 PR 通知人工。

為什麼需要這一支（2026-08-27）：
這一天用搜尋人工挖了一輪，成果是 4 場站上完全沒收錄的賽事、1 份九個名次的官方成績名單、
2 場「已經打完但站上還寫著即將舉行」。**那些線索一個都不在既有 pipeline 的覆蓋範圍內。**

既有三支各自看的是：縣市政府／教育網 RSS（county_edu_news）、主辦協會官網文章 API
（organizer_articles，實測只有 2024–2025 的部落格文）、固定的賽事頁（event_announcements）。
而當天每一筆線索的實際來源是**新聞媒體**與**主辦單位自架的成績頁**——沒有任何一支在看那兩類。

用戶當天的指示是「每天都要檢查有沒有新資料」。這支就是那個機制：每日跑，
只對「沒看過的標題」告警。

設計取捨與安全邊界（沿用 county_edu_news 的既有判準）：
- **只偵測、不改寫**：賽事與成績屬事實型資料（站規鐵則 1），一律人工核實後手動寫進
  src/content/events/。本 adapter 絕不碰 src/。
- **只對「新標題」告警**：指紋只取 (source, title, link)，刻意丟掉摘要與發佈時間。
  新聞聚合器每天都會重排、改寫摘要，放進來就會天天觸發告警，很快沒人看。
- **抓取失敗不進指紋**：某個來源掛掉沿用上輪清單，錯誤另外記在 fetch_errors。
  這條是 2026-08-27 同日修 county_edu_news 時學到的——「抓不到」被算成 0 筆，
  會讓一個沒有新公告的日子開出一個空 PR。
- **known 清單設上限**：Google News 一個查詢就回上百則，不設限這個檔會無限長大。
  只留最近 MAX_KNOWN 筆；被擠掉的舊標題若再出現會被當成新的，那是可接受的誤報
  （方向是寧可多看一次，不要漏掉）。
"""
from __future__ import annotations
import json
import os
import re
import urllib.parse
import xml.etree.ElementTree as ET

import requests
import yaml

from pipeline.sources.base import Record
from pipeline.sources.county_edu_news import (
    HEADERS, TIMEOUT, TOPIC_KEYWORDS, RESULT_KEYWORDS, _hit, _parse_rss, _parse_html, _decode,
)

DEFAULT_CONFIG = os.path.join(os.path.dirname(__file__), "news_queries.yml")
ALERT_SLUG = "news-watch-alert"

# known 清單上限。六個查詢 × 每個上百則，不設限一週就是幾千行 diff。
MAX_KNOWN = 400

# Google News 的標題慣例是「標題 - 媒體名」，比對主題時把媒體名留著沒關係，
# 但存進 known 前保持原樣——標題是人要讀的，不做正規化。
GOOGLE_NEWS = (
    "https://news.google.com/rss/search?q={q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
)

_CDATA_RE = re.compile(r"<!\[CDATA\[|\]\]>")


class NewsWatch:
    name = "news_watch"
    out_dir = "pipeline/state/news-alerts"

    def __init__(self, config_path: str | None = None, content_root: str = ".") -> None:
        self.config_path = config_path or DEFAULT_CONFIG
        self.content_root = content_root

    def _sources(self) -> list[dict]:
        with open(self.config_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        return [x for x in (cfg.get("sources") or []) if x.get("query") or x.get("url")]

    def _prev(self) -> dict[str, list[dict]]:
        """上一輪各來源看過的標題，供抓取失敗時沿用（避免誤判成全新一批）。"""
        path = os.path.join(self.content_root, self.out_dir, f"{ALERT_SLUG}.yml")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except yaml.YAMLError:
            return {}
        prev: dict[str, list[dict]] = {}
        for row in data.get("known") or []:
            prev.setdefault(row.get("source", ""), []).append(
                {"title": row.get("title", ""), "link": row.get("link", "")}
            )
        return prev

    @staticmethod
    def _url_for(src: dict) -> str:
        if (src.get("mode") or "google_news") == "google_news":
            return GOOGLE_NEWS.format(q=urllib.parse.quote(src["query"]))
        return src["url"]

    def fetch(self) -> bytes:
        prev = self._prev()
        collected: list[dict] = []
        errors: list[dict] = []
        for src in self._sources():
            label = src.get("label") or self._url_for(src)
            mode = (src.get("mode") or "google_news").lower()
            try:
                res = requests.get(self._url_for(src), timeout=TIMEOUT, headers=HEADERS)
                res.raise_for_status()
                items = (_parse_rss(res.content) if mode == "google_news"
                         else _parse_html(_decode(res), src.get("link_re")))
                if not items:
                    raise ValueError("解析後 0 筆（格式可能已改）")
            except Exception as exc:  # noqa: BLE001 — 單點失敗不打斷整輪
                errors.append({"source": label, "error": f"{type(exc).__name__}: {exc}"})
                items = prev.get(label, [])
            for it in items:
                title = _CDATA_RE.sub("", it.get("title", "")).strip()
                # 主題篩選必須在 fetch 做（理由同 county_edu_news）：Google News 的
                # html 模式來源會夾帶導覽列連結，不篩會讓指紋天天變。
                if not _hit(title, TOPIC_KEYWORDS):
                    continue
                collected.append({"source": label, "title": title, "link": it.get("link", "")})

        collected.sort(key=lambda x: (x["source"], x["title"], x["link"]))
        payload = {"items": collected, "errors": sorted(errors, key=lambda x: x["source"])}
        return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")

    @staticmethod
    def fingerprint(raw: bytes) -> bytes:
        """變更偵測只吃 items——抓取錯誤不是「有新消息」的訊號（理由同 county_edu_news）。"""
        payload = json.loads(raw.decode("utf-8"))
        return json.dumps({"items": payload.get("items", [])},
                          ensure_ascii=False, sort_keys=True).encode("utf-8")

    def parse(self, raw: bytes) -> list[Record]:
        payload = json.loads(raw.decode("utf-8"))
        items = payload.get("items", [])
        errors = payload.get("errors", [])
        # 上一輪看過的 (title, link)，用來標出這一輪真正新出現的那些。
        known_pairs = {(row.get("title", ""), row.get("link", ""))
                       for rows in self._prev().values() for row in rows}

        matched = []
        for it in items:
            title = it.get("title", "")
            matched.append({
                "source": it.get("source", ""),
                "title": title,
                "link": it.get("link", ""),
                "looks_like_results": _hit(title, RESULT_KEYWORDS),
                "is_new": (title, it.get("link", "")) not in known_pairs,
            })

        new_items = [m for m in matched if m["is_new"]]
        data = {
            "note": (
                "每日新聞與主辦單位公告監看。is_new=true 是這一輪才出現的標題；"
                "looks_like_results=true 代表標題含成績字樣，請優先人工核實後補進 "
                "src/content/events/。本 adapter 只偵測不改寫（站規鐵則 1）。"
            ),
            "new_count": len(new_items),
            "new_items": new_items,
            "results_candidates": [m for m in new_items if m["looks_like_results"]],
            "fetch_errors": errors,
            # known＝本輪看過的全部標題，供下一輪比對「哪些是新的」，並在抓取失敗時沿用。
            # 只留最近 MAX_KNOWN 筆，否則這個檔會無限長大（Google News 一查就上百則）。
            "known": [{"source": i.get("source", ""), "title": i.get("title", ""),
                       "link": i.get("link", "")} for i in items][-MAX_KNOWN:],
        }
        return [Record(slug=ALERT_SLUG, data=data, raw=raw, free_text_fields=["new_items"])]
