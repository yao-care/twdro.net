"""政府開放資料：教育部統計處學校名錄 → organizations 主檔。

用途：建立學校資料庫、對應隊伍所屬學校、避免使用者每次自由輸入校名。
僅索引用途、遵守來源 ToS，不高頻爬取。

真實來源（教育部統計處，欄位：學年度/代碼/學校名稱/公私立/縣市名稱/地址/電話/網址）：
- 國中：https://stats.moe.gov.tw/files/opendata/j1_new.json
- 國小：https://stats.moe.gov.tw/files/opendata/b1_new.json
- 高中：https://stats.moe.gov.tw/files/opendata/h1_new.json
原始資料含多個學年度，需依代碼去重取最新；縣市/地址帶有 [代碼] 前綴需清除。
"""
from __future__ import annotations
import json
import os
import re

import requests

from pipeline.sources.base import Record

# 預設抓國中名錄；workflow/部署可用環境變數 MOE_SCHOOLS_URL 覆寫成國小/高中等。
DEFAULT_URL = "https://stats.moe.gov.tw/files/opendata/j1_new.json"

_BRACKET_RE = re.compile(r"^\[[^\]]*\]")


def _strip_bracket(s: str) -> str:
    """移除開頭的 [代碼] 前綴，如 '[01]新北市' → '新北市'。"""
    return _BRACKET_RE.sub("", s or "").strip()


def _slugify(name: str) -> str:
    s = re.sub(r"\s+", "-", name.strip())
    s = re.sub(r"[^0-9A-Za-z一-鿿-]", "", s)
    return s or "school"


class MoeSchools:
    name = "moe_schools"
    out_dir = "src/content/organizations"

    def __init__(self, url: str | None = None) -> None:
        self.url = url or os.environ.get("MOE_SCHOOLS_URL", "") or DEFAULT_URL

    def fetch(self) -> bytes:
        """抓取學校清單原始 JSON（bytes）。"""
        if not self.url:
            raise RuntimeError("未設定學校名錄 URL，無法抓取。")
        resp = requests.get(self.url, timeout=60, headers={"User-Agent": "twdro-pipeline/1.0"})
        resp.raise_for_status()
        return resp.content

    def parse(self, raw: bytes) -> list[Record]:
        """把學校 JSON 正規化為 organizations record。

        - 依「代碼」去重，保留最新學年度那筆。
        - 清除縣市的 [代碼] 前綴。
        - 只有為合法 http(s) 網址時才輸出 website（符合 z.string().url()）。
        """
        rows = json.loads(raw.decode("utf-8"))
        latest: dict[str, dict] = {}
        for row in rows:
            name = (row.get("學校名稱") or row.get("name") or "").strip()
            if not name:
                continue
            key = (row.get("代碼") or name).strip()
            year = str(row.get("學年度", ""))
            if key not in latest or year > str(latest[key].get("學年度", "")):
                latest[key] = row

        records: list[Record] = []
        for row in latest.values():
            name = (row.get("學校名稱") or row.get("name") or "").strip()
            data: dict = {"name": name, "org_type": "school"}
            city = _strip_bracket(row.get("縣市名稱") or row.get("city") or "")
            if city:
                data["city"] = city
            website = (row.get("網址") or row.get("website") or "").strip()
            if website.startswith("http://") or website.startswith("https://"):
                data["website"] = website
            records.append(Record(slug=_slugify(name), data=data, raw=raw, free_text_fields=[]))
        return records
