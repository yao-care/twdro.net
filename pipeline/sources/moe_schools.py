"""政府開放資料：學校基本資料 → organizations 主檔。

用途：建立學校資料庫、對應隊伍所屬學校、避免使用者每次自由輸入校名。
僅索引用途、遵守來源 ToS，不高頻爬取。
"""
from __future__ import annotations
import json
import re

import requests

from pipeline.sources.base import Record, Source

# 政府資料開放平臺「高級中等以下學校名錄」類資源（示範用；正式部署可換成明確資源 URL）。
DATA_URL = "https://data.gov.tw/api/v2/rest/datastore/"  # 佔位；workflow 以環境變數覆寫


def _slugify(name: str) -> str:
    s = re.sub(r"\s+", "-", name.strip())
    s = re.sub(r"[^0-9A-Za-z一-鿿-]", "", s)
    return s or "school"


class MoeSchools:
    name = "moe_schools"
    out_dir = "src/content/organizations"

    def __init__(self, url: str = DATA_URL) -> None:
        self.url = url

    def fetch(self) -> bytes:
        """抓取學校清單原始 JSON（bytes）。正式部署由 workflow 設定實際資源 URL。"""
        resp = requests.get(self.url, timeout=30, headers={"User-Agent": "twdro-pipeline/1.0"})
        resp.raise_for_status()
        return resp.content

    def parse(self, raw: bytes) -> list[Record]:
        """把學校 JSON 正規化為 organizations record。"""
        rows = json.loads(raw.decode("utf-8"))
        records: list[Record] = []
        for row in rows:
            name = (row.get("學校名稱") or row.get("name") or "").strip()
            if not name:
                continue
            data: dict = {"name": name, "org_type": "school"}
            city = (row.get("縣市名稱") or row.get("city") or "").strip()
            if city:
                data["city"] = city
            website = (row.get("網址") or row.get("website") or "").strip()
            if website:
                data["website"] = website
            records.append(Record(slug=_slugify(name), data=data, raw=raw, free_text_fields=[]))
        return records
