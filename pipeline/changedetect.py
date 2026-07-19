"""內容雜湊與變更偵測。官方文件 hash 變了就視為新版本，不覆寫舊版。"""
from __future__ import annotations
import hashlib
import json
import os
from typing import Optional


def content_hash(data: bytes) -> str:
    """回傳資料的 sha256 十六進位字串。"""
    return "sha256:" + hashlib.sha256(data).hexdigest()


class Manifest:
    """記錄每個來源 key 的最後已知 hash，用於變更偵測。"""

    def __init__(self, data: Optional[dict] = None) -> None:
        self._data: dict[str, str] = dict(data or {})

    @classmethod
    def load(cls, path: str) -> "Manifest":
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return cls(json.load(f))
        return cls()

    def get(self, key: str) -> Optional[str]:
        return self._data.get(key)

    def set(self, key: str, hash_value: str) -> None:
        self._data[key] = hash_value

    def is_changed(self, key: str, hash_value: str) -> bool:
        """key 不存在（新來源）或 hash 不同 → 視為變更。"""
        return self._data.get(key) != hash_value

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2, sort_keys=True)
