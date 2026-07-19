"""Orchestrator：抓取 → 變更偵測 → parse → CKIP scrub → 產出候選 → PR body。

pipeline 只到「產出候選 + PR body」，不 merge、不上站。發佈永遠由人工在 PR 完成。
"""
from __future__ import annotations
import argparse
import os
import sys

from pipeline.changedetect import Manifest, content_hash
from pipeline.emit import write_candidate
from pipeline.report import Candidate, build_pr_body
from pipeline.scrub import NER, scrub_record

DEFAULT_MANIFEST = "pipeline/state/manifest.json"
PR_BODY_PATH = "pipeline/state/pr-body.md"


def run_source(source, manifest_path: str, ner: NER) -> tuple[list[Candidate], bool]:
    """對單一來源跑完整流程。回傳（候選清單, 是否有變更）。

    無變更（hash 相同）→ 回傳空候選，不做事。
    """
    raw = source.fetch()
    key = source.name
    h = content_hash(raw)
    manifest = Manifest.load(manifest_path)
    if not manifest.is_changed(key, h):
        return [], False

    candidates: list[Candidate] = []
    for rec in source.parse(raw):
        path = write_candidate(rec.data, source.out_dir, rec.slug)
        scrub = scrub_record(rec.data, rec.free_text_fields, ner)
        candidates.append(Candidate(slug=rec.slug, path=path, changed=True, scrub=scrub))

    manifest.set(key, h)
    manifest.save(manifest_path)
    return candidates, True


def _load_source(name: str):
    if name == "moe_schools":
        from pipeline.sources.moe_schools import MoeSchools
        # 環境變數優先；未設定時 MoeSchools 會用內建教育部統計處預設 URL。
        url = os.environ.get("MOE_SCHOOLS_URL", "").strip() or None
        return MoeSchools(url)
    raise SystemExit(f"未知來源：{name}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="twdro 資料 pipeline")
    parser.add_argument("--source", required=True, help="來源名稱，如 moe_schools")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    args = parser.parse_args(argv)

    source = _load_source(args.source)
    if source is None:
        return 0
    from pipeline.scrub import ckip_ner
    candidates, changed = run_source(source, args.manifest, ckip_ner())

    if not changed:
        print(f"[{args.source}] 無變更，結束。")
        return 0

    body = build_pr_body(args.source, candidates)
    import os
    os.makedirs(os.path.dirname(PR_BODY_PATH), exist_ok=True)
    with open(PR_BODY_PATH, "w", encoding="utf-8") as f:
        f.write(body)
    flagged = sum(1 for c in candidates if c.scrub.has_person)
    print(f"[{args.source}] 候選 {len(candidates)} 筆，人名警示 {flagged} 筆。PR body → {PR_BODY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
