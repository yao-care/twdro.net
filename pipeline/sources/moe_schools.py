"""政府開放資料：教育部統計處學校名錄 → 只 enrich「有隊伍的學校」。

用途（2026-07-21 重新定調）：**只補站上已有隊伍的學校**的官方 city／website，
不新增任何學校。理由——教育部名錄一抓就是整份（國中 700+ 所），全數列成
organizations 會灌爆主檔、與「無人機足球」無關；真正有價值的是替**已被某支隊伍
（teams 的 organization 欄）指到、且 org_type=school 的既有學校**自動補齊官方資料。

判定「有隊伍的學校」：
- 掃 src/content/teams/*.yml 的 `organization` 欄 → 得被指到的 organization slug。
- 讀這些 organizations/*.yml，取 org_type=school 者的 `name` 當比對目標。
- 只有名錄中比對到這些校名、且該校 city／website 有缺時，才產出「補齊後」的候選，
  覆寫既有 org 檔（同 slug）。既有值不覆蓋（只補空缺），學校無個資 → 不觸發人名閘門。

真實來源（教育部統計處，欄位：學年度/代碼/學校名稱/公私立/縣市名稱/地址/電話/網址）：
- 國中：https://stats.moe.gov.tw/files/opendata/j1_new.json
- 國小：https://stats.moe.gov.tw/files/opendata/b1_new.json
- 高中：https://stats.moe.gov.tw/files/opendata/h1_new.json
原始資料含多個學年度，需依代碼去重取最新；縣市/地址帶有 [代碼] 前綴需清除。
"""
from __future__ import annotations
import glob as _glob
import json
import os
import re

import requests
import yaml

from pipeline.sources.base import Record

# 預設抓國中名錄；workflow/部署可用環境變數 MOE_SCHOOLS_URL 覆寫成國小/高中等。
DEFAULT_URL = "https://stats.moe.gov.tw/files/opendata/j1_new.json"

_BRACKET_RE = re.compile(r"^\[[^\]]*\]")
# 校名正規化：去掉開頭的設立別與常見冗字，讓名錄「市立OO國中」對得上站上「OO國中」。
_PREFIX_RE = re.compile(r"^(國立|市立|縣立|私立|公立)")
_NOISE_RE = re.compile(r"(高級|完全|國民|附設|附屬)")


def _strip_bracket(s: str) -> str:
    """移除開頭的 [代碼] 前綴，如 '[01]新北市' → '新北市'。"""
    return _BRACKET_RE.sub("", s or "").strip()


def _norm_name(name: str) -> str:
    """正規化校名以供跨來源比對：去設立別前綴、去冗字、去空白。"""
    s = (name or "").strip()
    s = _PREFIX_RE.sub("", s)
    s = _NOISE_RE.sub("", s)
    s = re.sub(r"\s+", "", s)
    return s


def _names_match(a: str, b: str) -> bool:
    """兩校名正規化後相等，或較短者為較長者子字串（核心 ≥3 字，避免誤配）。"""
    na, nb = _norm_name(a), _norm_name(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    return len(shorter) >= 3 and shorter in longer


class MoeSchools:
    name = "moe_schools"
    out_dir = "src/content/organizations"

    def __init__(self, url: str | None = None, content_root: str = ".",
                 targets: dict | None = None) -> None:
        """targets：{校名: {"slug":.., "data":..}}；未提供則於 parse 時自檔案系統推導。

        content_root 供測試指向暫存目錄；正式執行用 repo 根目錄（"."）。
        """
        self.url = url or os.environ.get("MOE_SCHOOLS_URL", "") or DEFAULT_URL
        self.content_root = content_root
        self._targets = targets

    # ── 目標校清單（有隊伍的學校）────────────────────────────────
    def _load_targets(self) -> dict:
        """回傳 {校名: {"slug":org_slug, "data":現有 org 內容}}。

        來源＝teams 的 organization 欄指到、且 org_type=school 的既有 organizations。
        """
        if self._targets is not None:
            return self._targets

        teams_dir = os.path.join(self.content_root, "src/content/teams")
        orgs_dir = os.path.join(self.content_root, "src/content/organizations")

        referenced: set[str] = set()
        for path in _glob.glob(os.path.join(teams_dir, "*.yml")):
            try:
                with open(path, encoding="utf-8") as f:
                    d = yaml.safe_load(f) or {}
            except Exception:
                continue
            org = d.get("organization")
            if isinstance(org, str) and org.strip():
                referenced.add(org.strip())

        targets: dict = {}
        for slug in referenced:
            org_path = os.path.join(orgs_dir, f"{slug}.yml")
            if not os.path.exists(org_path):
                continue
            try:
                with open(org_path, encoding="utf-8") as f:
                    d = yaml.safe_load(f) or {}
            except Exception:
                continue
            if d.get("org_type") != "school":
                continue
            name = (d.get("name") or "").strip()
            if name:
                targets[name] = {"slug": slug, "data": d}

        self._targets = targets
        return targets

    # ── 抓取 ─────────────────────────────────────────────────────
    def fetch(self) -> bytes:
        """抓取學校清單原始 JSON（bytes）。"""
        if not self.url:
            raise RuntimeError("未設定學校名錄 URL，無法抓取。")
        resp = requests.get(self.url, timeout=60, headers={"User-Agent": "twdro-pipeline/1.0"})
        resp.raise_for_status()
        return resp.content

    # ── 解析：只 enrich 有隊伍的學校 ────────────────────────────
    def parse(self, raw: bytes) -> list[Record]:
        """比對名錄與「有隊伍的學校」，只對缺 city／website 者產出補齊候選。

        - 依「代碼」去重，保留最新學年度那筆。
        - 清除縣市的 [代碼] 前綴；只有合法 http(s) 才採 website。
        - 既有欄位不覆蓋（只補空缺）；無可補者不產出（→ pipeline no-op、不佔版控）。
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

        targets = self._load_targets()
        if not targets:
            return []

        records: list[Record] = []
        used: set[str] = set()
        for row in latest.values():
            moe_name = (row.get("學校名稱") or row.get("name") or "").strip()
            if not moe_name:
                continue

            # 找出對應的「有隊伍的學校」
            match_name = None
            for tname in targets:
                if tname in used:
                    continue
                if _names_match(moe_name, tname):
                    match_name = tname
                    break
            if match_name is None:
                continue

            info = targets[match_name]
            merged = dict(info["data"])
            added = False

            city = _strip_bracket(row.get("縣市名稱") or row.get("city") or "")
            if city and not merged.get("city"):
                merged["city"] = city
                added = True

            website = (row.get("網址") or row.get("website") or "").strip()
            if (website.startswith("http://") or website.startswith("https://")) \
                    and not merged.get("website"):
                merged["website"] = website
                added = True

            if not added:
                continue  # 該校資料已齊，無需補 → 不產出候選

            used.add(match_name)
            records.append(Record(
                slug=info["slug"], data=merged, raw=raw, free_text_fields=[],
            ))
        return records
