"""將正規化 record 產出為候選 YAML（符合網站 content schema）。"""
from __future__ import annotations
import os
import re
from typing import Any

import yaml

# 這些欄位若為日期字串，YAML 需加引號避免被解析成 date 物件（撞網站 z.string()）。
DATE_KEYS = {"published_at", "retrieved_at", "effective_from", "effective_to",
             "registration_start", "registration_end", "event_start", "event_end",
             "founded_at", "verified_at", "updated_at"}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


class _QuotedStr(str):
    """標記為需強制加引號輸出的字串。"""


def _quoted_representer(dumper: yaml.Dumper, data: _QuotedStr):
    return dumper.represent_scalar("tag:yaml.org,2002:str", str(data), style='"')


yaml.add_representer(_QuotedStr, _quoted_representer)


def _mark_dates(obj: Any) -> Any:
    """遞迴將日期欄位值標記為強制加引號字串。"""
    if isinstance(obj, dict):
        return {k: (_QuotedStr(v) if (k in DATE_KEYS and isinstance(v, str) and _DATE_RE.match(v)) else _mark_dates(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mark_dates(x) for x in obj]
    return obj


def to_yaml(record: dict) -> str:
    """回傳 record 的 YAML 字串；日期欄位強制加引號。"""
    marked = _mark_dates(record)
    return yaml.dump(marked, allow_unicode=True, sort_keys=False, default_flow_style=False)


def write_candidate(record: dict, out_dir: str, slug: str) -> str:
    """把 record 寫成 out_dir/slug.yml，回傳檔案路徑。"""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{slug}.yml")
    with open(path, "w", encoding="utf-8") as f:
        f.write(to_yaml(record))
    return path
