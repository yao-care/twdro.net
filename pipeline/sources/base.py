"""來源 adapter 協定與 Record 型別。"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Record:
    slug: str
    data: dict
    raw: bytes = b""
    free_text_fields: list[str] = field(default_factory=list)


class Source(Protocol):
    name: str
    out_dir: str

    def fetch(self) -> bytes:
        """抓取原始資料（bytes），供 hash 存證與 parse。"""
        ...

    def parse(self, raw: bytes) -> list[Record]:
        """把原始資料正規化成 Record 清單。"""
        ...
