"""縣市教育網／學校公告監控 adapter：出現無人機足球相關公告即開 PR 通知人工。

為什麼需要這一支（2026-08-03）：
`pipeline/sources/organizer_articles.py` 的開頭寫著「全臺沒有任何可爬取的網頁在公布
無人機足球賽事成績」，並據此把成績列為只能等主辦單位發佈的市場級缺口。**那個結論
的範圍下錯了。**

本日查 GSC 建議字挖到的具體查詢「無人機足球比賽嘉義縣蒜頭國小」時發現：
**縣市政府教育處會公告成績。** 嘉義縣政府教育處教學發展科 2026-05-29 的
「嘉義縣115年度無人機足球競賽成績公告」即為 trust_level A 的一手來源，站上第一筆
賽事成績（events/2026-chiayi-county-selection）就是這樣補上的；同一輪還從地方新聞
補到第二筆（events/2026-yunlin-county-cup，六個名次完整）。

所以舊結論要縮小適用範圍：對天穹盃系列仍成立（主辦協會確實沒公布），但**不適用於
縣市層級**——那一層一直有在公告，只是沒有人在看。

這支的目的就是別再讓「想到才手動搜一輪」決定我們拿不拿得到成績。

設計取捨與安全邊界（沿用 organizer_articles 的既有判準）：
- **只偵測、不改寫**：成績屬事實型資料（站規鐵則 1），一律人工核實後手動寫進
  `src/content/events/`。本 adapter 絕不碰 src/。
- **只對「新公告」告警**：指紋只取 (feed, title, link)，**刻意丟掉內文與發佈時間**。
  否則對方改個錯字、或列表頁的相對時間字串每天變動，就會天天觸發告警，很快沒人看。
- **抗暫時性錯誤**：單一來源抓取失敗不中斷其他來源，也不會讓已知公告「消失」而被
  誤判成全新的一批（失敗的來源沿用上輪清單）。
- **雙層關鍵字**：先用無人機足球相關詞篩出主題，再用成績詞標記 `looks_like_results`，
  讓人工一眼知道哪幾則要立刻去補 events YAML。
- **來源清單走設定檔**（`county_feeds.yml`）：加縣市不必改程式。實測結果與尚未納入的
  縣市原因寫在那份 YAML 裡。
"""
from __future__ import annotations
import json
import os
import re
import xml.etree.ElementTree as ET

import requests
import yaml

from pipeline.sources.base import Record

DEFAULT_CONFIG = os.path.join(os.path.dirname(__file__), "county_feeds.yml")

# 單一 alert 檔的 slug（穩定→覆寫；PR diff 即顯示這輪多了哪幾則）。
ALERT_SLUG = "county-edu-news-alert"

# 第一層：主題篩選。命中才進入 alert（縣市教育網公告量大，不篩會淹沒）。
TOPIC_KEYWORDS = ("無人機足球", "無人機飛球", "無人機競賽", "無人機足球競賽", "飛球錦標賽")

# 第二層：成績標記。與 organizer_articles 同一組詞，判準一致。
RESULT_KEYWORDS = ("成績", "冠軍", "亞軍", "季軍", "名次", "得獎", "賽果", "優勝", "獲獎", "榜")

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_A_RE = re.compile(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)

TIMEOUT = 25
HEADERS = {"User-Agent": "twdro.net-pipeline/1.0 (+https://twdro.net)"}


def _text(s: str) -> str:
    """去標籤、壓空白。列表頁的連結文字常夾雜 <span>、換行與全形空白。"""
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", s or "")).strip()


def _hit(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def _parse_rss(raw: str) -> list[dict]:
    """解析 RSS/Atom，回傳 [{title, link}]。解析失敗回空清單（交由呼叫端沿用舊值）。"""
    out: list[dict] = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return out
    # RSS 2.0 的 channel/item，以及 Atom 的 entry 都吃
    for item in root.iter():
        tag = item.tag.split("}")[-1]
        if tag not in ("item", "entry"):
            continue
        title = link = ""
        for child in item:
            ctag = child.tag.split("}")[-1]
            if ctag == "title":
                title = _text(child.text or "")
            elif ctag == "link":
                link = _text(child.text or "") or child.attrib.get("href", "")
        if title:
            out.append({"title": title, "link": link})
    return out


def _parse_html(raw: str, link_re: str | None) -> list[dict]:
    """從列表頁抽 <a href>…</a>。link_re 用來濾掉導覽列等非公告連結。"""
    pat = re.compile(link_re) if link_re else None
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for href, inner in _A_RE.findall(raw):
        title = _text(inner)
        # 太短的多半是「更多」「下一頁」這類介面文字，不是公告標題
        if len(title) < 6:
            continue
        if pat and not pat.search(href):
            continue
        key = (title, href)
        if key in seen:
            continue
        seen.add(key)
        out.append({"title": title, "link": href})
    return out


class CountyEduNews:
    name = "county_edu_news"
    out_dir = "pipeline/state/county-edu-alerts"

    def __init__(self, config_path: str | None = None, content_root: str = ".") -> None:
        self.config_path = config_path or DEFAULT_CONFIG
        self.content_root = content_root

    def _feeds(self) -> list[dict]:
        with open(self.config_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        return [x for x in (cfg.get("feeds") or []) if x.get("url")]

    def _prev(self) -> dict[str, list[dict]]:
        """上一輪各來源「命中主題」的公告，供抓取失敗時沿用（避免誤判成全新一批）。"""
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
            prev.setdefault(row.get("feed", ""), []).append(
                {"title": row.get("title", ""), "link": row.get("link", "")}
            )
        return prev

    def fetch(self) -> bytes:
        """逐一抓取設定檔列出的來源。單一來源失敗沿用上輪清單，不中斷其他來源。

        回傳的 JSON 只含 (feed, title, link) 且經排序——變更偵測的 hash 吃這份，
        所以刻意不放時間戳與內文，否則每天都會被判定為「有變更」。

        ⚠️ **主題篩選必須在這裡做，不能只在 parse 做**（2026-08-03 首次實跑才發現）：
        縣市教育網每天都在發代理教師甄選、研習轉知這類公告，若把全部公告放進
        payload，hash 天天都變 → 每天開一個 `matched: []` 的空 PR，一週內就沒人看了。
        只讓命中無人機足球主題的公告進入 payload，才會是「真的有相關公告才告警」。
        """
        prev = self._prev()
        collected: list[dict] = []
        errors: list[dict] = []
        for feed in self._feeds():
            label = feed.get("label") or feed["url"]
            try:
                res = requests.get(feed["url"], timeout=TIMEOUT, headers=HEADERS)
                res.raise_for_status()
                body = res.text
                mode = (feed.get("mode") or "rss").lower()
                items = _parse_rss(body) if mode == "rss" else _parse_html(body, feed.get("link_re"))
                if not items:
                    raise ValueError("解析後 0 筆（格式可能已改）")
            except Exception as exc:  # noqa: BLE001 — 任何失敗都退回上輪，不讓單點打斷整輪
                errors.append({"feed": label, "error": f"{type(exc).__name__}: {exc}"})
                items = prev.get(label, [])
            for it in items:
                # 主題篩選在此，理由見 docstring：不篩會讓 hash 天天變、天天開空 PR。
                if not _hit(it["title"], TOPIC_KEYWORDS):
                    continue
                collected.append({"feed": label, "title": it["title"], "link": it["link"]})

        collected.sort(key=lambda x: (x["feed"], x["title"], x["link"]))
        payload = {"items": collected, "errors": sorted(errors, key=lambda x: x["feed"])}
        return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")

    def parse(self, raw: bytes) -> list[Record]:
        payload = json.loads(raw.decode("utf-8"))
        items = payload.get("items", [])
        errors = payload.get("errors", [])

        # items 在 fetch 階段已篩過主題；這裡再篩一次是為了讓 parse 能被單獨測試，
        # 也讓手動塞進來的 payload 不會繞過篩選。
        matched = []
        for it in items:
            title = it.get("title", "")
            if not _hit(title, TOPIC_KEYWORDS):
                continue
            matched.append({
                "feed": it.get("feed", ""),
                "title": title,
                "link": it.get("link", ""),
                "looks_like_results": _hit(title, RESULT_KEYWORDS),
            })

        data = {
            "note": (
                "縣市教育網公告監控。命中無人機足球相關關鍵字的公告列在 matched；"
                "looks_like_results=true 代表標題同時含成績字樣，請優先人工核實後補進 "
                "src/content/events/。本 adapter 只偵測不改寫（站規鐵則 1）。"
            ),
            "matched": matched,
            "matched_count": len(matched),
            "results_candidates": [m for m in matched if m["looks_like_results"]],
            "fetch_errors": errors,
            # known＝本輪命中主題的公告，供下一輪抓取失敗時沿用，避免把「抓不到」誤判成
            # 「全是新的」。刻意不存全部公告：那會讓這個檔每天都被改寫（見 fetch docstring）。
            "known": [{"feed": i.get("feed", ""), "title": i.get("title", ""),
                       "link": i.get("link", "")} for i in items],
        }
        return [Record(slug=ALERT_SLUG, data=data, raw=raw, free_text_fields=["matched"])]
