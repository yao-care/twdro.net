"""賽事公告 adapter：監看官方公告頁，擷取賽事名稱候選 → draft 賽事進 PR。

現實限制與設計取捨：
- 天穹盃/教科盃公告散在 FB、JS 渲染站與學校轉知頁。**FB/社群不爬（ToS）**、
  JS 站純文字抓不到；唯一穩定可解析的是學校/協會 HTML 公告頁。
- 台灣公告習慣把活動名稱放在「」括號內，故以「」＋關鍵字（無人機/飛球＋盃/賽）
  啟發式擷取賽事名稱，並就近找日期線索。
- 擷取結果為 **draft 候選賽事**（status=draft、verification=unverified），
  僅供人工在 PR 審核補全，pipeline 不自動發佈（符合三層防護與人工閘門）。
- 監看 URL 為可設定清單；擴充覆蓋＝加入新的穩定 HTML 公告/列表頁。
"""
from __future__ import annotations
import datetime
import hashlib
import html as html_lib
import json
import re

import requests

from pipeline.sources.base import Record

# 候選標題來源：(1)「」『』括號內容；(2) 由中文/英數/破折號組成的獨立標題片段
BRACKET_RE = re.compile(r"[「『]([^」』\n]{4,80})[」』]")
TITLE_RE = re.compile(r"[0-9A-Za-z一-鿿－–—\-·・]{8,50}")
_KW_KIND = re.compile(r"無人機|飛球")
# 競賽類字詞（比單一「賽」嚴格，降低誤抓一般文字）
_KW_EVENT = re.compile(r"錦標賽|公開賽|競賽|友誼賽|邀請賽|爭霸賽|表演賽|盃")


def _is_event_title(t: str) -> bool:
    return bool(_KW_KIND.search(t) and _KW_EVENT.search(t))
# 日期線索：115年7月11日 / 2026-07-11 / 2026/7/11 / 7月11日
DATE_RE = re.compile(r"(\d{3}年\d{1,2}月\d{1,2}日|20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

# 預設監看的官方 HTML 公告頁（穩定、非社群、非 JS 渲染）。擴充覆蓋即加入此清單。
DEFAULT_URLS = [
    "https://www.tsjh.ntpc.edu.tw/p/404-1000-9416.php",   # 天穹盃 新北戰 簡章
    "https://www.jges.ntpc.edu.tw/p/406-1000-9043,r43.php",  # 教科盃 新北地區公開賽
    "https://slnps.ntct.edu.tw/p/406-1079-496742,r357.php",  # 天穹盃 南投戰
]


def _strip_html(raw_html: str) -> str:
    text = _TAG_RE.sub(" ", raw_html)
    text = html_lib.unescape(text)
    return _WS_RE.sub(" ", text)


def _slug(title: str) -> str:
    return "draft-" + hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]


class EventAnnouncements:
    name = "event_announcements"
    out_dir = "src/content/events"

    def __init__(self, urls: list[str] | None = None) -> None:
        self.urls = list(urls) if urls else list(DEFAULT_URLS)

    def fetch(self) -> bytes:
        """抓取所有監看頁，回傳 {url: html} 的 JSON bytes（供雜湊與 parse）。"""
        pages: dict[str, str] = {}
        for u in self.urls:
            try:
                r = requests.get(u, timeout=30, headers={"User-Agent": "twdro-pipeline/1.0"})
                r.raise_for_status()
                pages[u] = r.text
            except Exception:
                pages[u] = ""  # 單頁失敗不影響其他頁；下次再試
        return json.dumps(pages, ensure_ascii=False, sort_keys=True).encode("utf-8")

    def parse(self, raw: bytes) -> list[Record]:
        """從各頁 HTML 擷取賽事名稱候選，產出 draft 賽事 Record。"""
        pages = json.loads(raw.decode("utf-8"))
        today = datetime.date.today().isoformat()
        seen: set[str] = set()
        records: list[Record] = []
        for url, raw_html in pages.items():
            if not raw_html:
                continue
            text = _strip_html(raw_html)
            # 收集候選（括號內 + 獨立標題片段），記錄各自在文中的位置以就近找日期
            spans: list[tuple[str, int, int]] = []
            for m in BRACKET_RE.finditer(text):
                spans.append((m.group(1).strip(), m.start(), m.end()))
            for m in TITLE_RE.finditer(text):
                spans.append((m.group(0).strip(), m.start(), m.end()))
            for title, start, end in spans:
                if not _is_event_title(title) or title in seen:
                    continue
                seen.add(title)
                window = text[max(0, start - 150): end + 150]
                dm = DATE_RE.search(window)
                data: dict = {
                    "title": title,
                    "status": "draft",
                    "rule_system": "OTHER",
                    "verification": "unverified",
                    "sources": [{
                        "type": "organizer_announcement",
                        "url": url,
                        "retrieved_at": today,
                        "trust_level": "C",
                    }],
                }
                if dm:
                    data["subtitle"] = f"pipeline 擷取日期線索：{dm.group(1)}（待人工確認）"
                records.append(Record(
                    slug=_slug(title), data=data, raw=raw,
                    free_text_fields=["title", "subtitle"],
                ))
        return records
