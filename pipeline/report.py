"""產生 PR body：列出候選資料、標記 CKIP 偵測到人名者、附審核提醒。"""
from __future__ import annotations
from dataclasses import dataclass

from pipeline.scrub import ScrubResult


@dataclass
class Candidate:
    slug: str
    path: str
    changed: bool
    scrub: ScrubResult


def build_pr_body(source: str, candidates: list[Candidate]) -> str:
    lines: list[str] = []
    lines.append(f"## 資料 pipeline 候選：`{source}`")
    lines.append("")
    lines.append("> 本 PR 由 pipeline 自動產生，**尚未上站**。請人工審核後再 merge。")
    lines.append("")
    flagged = [c for c in candidates if c.scrub.has_person]
    if flagged:
        lines.append("### ⚠️ CKIP 偵測到可能的人名（個資警示）")
        lines.append("")
        lines.append("以下候選含疑似人名，merge 前務必收斂成隊伍層級或移除：")
        for c in flagged:
            names = "、".join(c.scrub.persons)
            lines.append(f"- ⚠️ `{c.slug}`（{c.path}）：{names}")
            for fld, ns in c.scrub.fields.items():
                lines.append(f"    - 欄位 `{fld}`：{'、'.join(ns)}")
        lines.append("")
    lines.append("### 全部候選")
    lines.append("")
    for c in candidates:
        mark = "⚠️" if c.scrub.has_person else "✅"
        state = "變更/新增" if c.changed else "無變更"
        lines.append(f"- {mark} `{c.slug}` — {state} — `{c.path}`")
    lines.append("")
    lines.append("---")
    lines.append("**審核清單**：資料來源正確？規則體系未混用？無選手個資？日期已加引號？")
    lines.append("務必經過**人工審核**再 merge，pipeline 不自動發佈。")
    return "\n".join(lines)
