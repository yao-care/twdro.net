"""第二層個資防護：CKIP NER 掃自由文字人名 → 標記（不自動塗改）。

本地測試以 mock NER 驗證掃描邏輯；CKIP（torch）僅在 CI/正式環境延遲載入。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable

NER = Callable[[str], list[str]]


@dataclass
class ScrubResult:
    has_person: bool = False
    persons: list[str] = field(default_factory=list)
    fields: dict[str, list[str]] = field(default_factory=dict)


def scrub_record(record: dict, free_text_fields: list[str], ner: NER) -> ScrubResult:
    """對 record 的指定自由文字欄位跑 NER，收集偵測到的人名。

    只標記、不修改 record（保留可稽核原文）；有人名 → has_person=True，
    orchestrator 依此擋自動 merge、進審核佇列。
    """
    result = ScrubResult()
    seen: set[str] = set()
    for key in free_text_fields:
        val = record.get(key)
        if not isinstance(val, str) or not val:
            continue
        found = [n for n in ner(val) if n]
        if found:
            result.fields[key] = found
            for n in found:
                if n not in seen:
                    seen.add(n)
                    result.persons.append(n)
    result.has_person = len(result.persons) > 0
    return result


def ckip_ner() -> NER:
    """回傳以 CKIP Transformers 為後端的 NER 函式（延遲載入 torch/模型）。

    僅在 CI/正式環境呼叫；本地離線測試請改傳 mock NER。
    """
    from ckip_transformers.nlp import CkipNerChunker  # 延遲 import，避免本地需要 torch

    chunker = CkipNerChunker(model="bert-base")

    def _ner(text: str) -> list[str]:
        entities = chunker([text])[0]
        return [e.word for e in entities if e.ner == "PERSON"]

    return _ner
