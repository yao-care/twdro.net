"""國際規則監控 adapter：監看 FAI／FIDA 官方規則頁指紋，變更即開 PR 通知人工。

設計取捨與安全邊界：
- **只偵測、不改寫**：官方規則（FAI F9A／FIDA Class 20/40）具權威性，
  不 rehost、不自動改寫 rulebooks/rules。本 adapter 只記錄各頁「內容指紋」，
  變更時產生一份 alert 供人工比對官方頁後**手動**更新站上規則。
- **HTML/PDF 通吃**：以位元組 sha256 當指紋，故規則書 PDF 與規則 HTML 頁皆可監看。
- **抗暫時性錯誤**：單頁抓取失敗時沿用上次已知指紋，避免 5xx/逾時誤觸變更警報。
- 監看 URL 為可設定清單（env `INTL_RULE_URLS`，逗號分隔），擴充覆蓋＝加入穩定頁。
"""
from __future__ import annotations
import datetime
import hashlib
import json
import os

import requests
import yaml

from pipeline.sources.base import Record

# 預設監看的官方規則頁（穩定、可解析）。可用 env INTL_RULE_URLS 覆寫。
DEFAULT_URLS = [
    "https://www.dronesoccer.org/dronesoccer/rules",        # FIDA 官方規則頁
    "https://www.dronesoccer.org/static/files/Rule-book-2.pdf",  # FIDA Class 20 規則書 PDF
    "https://www.fai.org/sites/default/files/documents/minutes_annex_7j_-_f9a_drone_soccer_rules.pdf",  # FAI F9A 規則
]

# 單一 alert 檔的 slug（穩定→覆寫；PR diff 即顯示哪一頁的指紋變了）。
ALERT_SLUG = "rule-change-alert"


class IntlRules:
    name = "fai_fida_rules"
    out_dir = "pipeline/state/intl-alerts"

    def __init__(self, urls: list[str] | None = None, content_root: str = ".") -> None:
        self.urls = list(urls) if urls else list(DEFAULT_URLS)
        # content_root 供測試指向暫存目錄；正式執行用 repo 根目錄（"."）。
        self.content_root = content_root

    def _prev_hashes(self) -> dict[str, str]:
        """讀上一輪 alert 檔的 {url: content_hash}，供抓取失敗時沿用。"""
        path = os.path.join(self.content_root, self.out_dir, f"{ALERT_SLUG}.yml")
        try:
            with open(path, encoding="utf-8") as f:
                d = yaml.safe_load(f) or {}
        except Exception:
            return {}
        out: dict[str, str] = {}
        for p in d.get("pages") or []:
            u = (p or {}).get("url")
            if isinstance(u, str) and u:
                out[u] = str((p or {}).get("content_hash") or "")
        return out

    def fetch(self) -> bytes:
        """抓取各監看頁，回傳 {url: {hash, ok}} 的 JSON bytes。

        以位元組 sha256 當指紋；單頁失敗沿用上次指紋（避免暫時性錯誤誤觸變更）。
        整體 JSON 的 hash 由 orchestrator 做變更偵測：任一頁指紋變 → 觸發 alert。
        """
        prev = self._prev_hashes()
        page_state: dict[str, dict] = {}
        for u in self.urls:
            try:
                r = requests.get(u, timeout=60, headers={"User-Agent": "twdro-pipeline/1.0"})
                r.raise_for_status()
                page_state[u] = {"hash": hashlib.sha256(r.content).hexdigest(), "ok": True}
            except Exception:
                page_state[u] = {"hash": prev.get(u, ""), "ok": False}
        return json.dumps(page_state, ensure_ascii=False, sort_keys=True).encode("utf-8")

    def parse(self, raw: bytes) -> list[Record]:
        """產出單一 rule-change alert Record（僅在指紋變更時被 orchestrator 呼叫）。"""
        pages = json.loads(raw.decode("utf-8"))
        today = datetime.date.today().isoformat()
        page_list = [
            {"url": u, "content_hash": info.get("hash", ""), "fetched_ok": bool(info.get("ok"))}
            for u, info in sorted(pages.items())
        ]
        data = {
            "detected_at": today,
            "note": ("官方規則頁指紋變更。請人工比對官方頁，必要時**手動**更新 "
                     "rulebooks/rules——切勿自動改寫官方規則。"),
            "pages": page_list,
        }
        # free_text_fields 留空：規則頁不涉個資，跳過 CKIP。
        return [Record(slug=ALERT_SLUG, data=data, raw=raw, free_text_fields=[])]
