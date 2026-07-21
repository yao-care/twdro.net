"""Orchestrator：抓取 → 變更偵測 → parse → CKIP scrub → 分流（自動併 / 開 PR）。

2026-07-21 改為「能自動就自動、踩到個資才停」：
- 候選經 CKIP 人名偵測。**未偵測到人名** → 寫入 auto-paths.txt，由 workflow 直接
  commit 進 main 自動上站（moe_schools 補校地址、events 乾淨草稿皆走此路）。
- **偵測到人名** → 寫入 pr-paths.txt + pr-body.md，由 workflow 開 PR 給人審，
  不自動上站（保護未成年選手個資、收斂成隊伍層級後才 merge）。
manifest（變更偵測狀態）一律隨自動併路徑進 main。
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
STATE_DIR = "pipeline/state"
AUTO_PATHS_PATH = "pipeline/state/auto-paths.txt"   # 乾淨候選 → 直接併 main
PR_PATHS_PATH = "pipeline/state/pr-paths.txt"       # 人名警示候選 → 只列於 PR
PR_BODY_PATH = "pipeline/state/pr-body.md"          # 人名警示候選的 PR 內文


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
    if name == "event_announcements":
        from pipeline.sources.announcements import EventAnnouncements
        # 逗號分隔的環境變數 EVENT_ANNOUNCEMENT_URLS 可覆寫監看清單。
        env = os.environ.get("EVENT_ANNOUNCEMENT_URLS", "").strip()
        urls = [u.strip() for u in env.split(",") if u.strip()] or None
        return EventAnnouncements(urls)
    raise SystemExit(f"未知來源：{name}")


def _clear_state_files() -> None:
    """清掉上一輪殘留的分流 state 檔（workflow 以檔案存在與否作為步驟 gate）。"""
    for p in (AUTO_PATHS_PATH, PR_PATHS_PATH, PR_BODY_PATH):
        if os.path.exists(p):
            os.remove(p)


def _write_lines(path: str, lines: list[str]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def route_candidates(source_name: str, candidates: list[Candidate],
                     manifest_path: str) -> tuple[list[Candidate], list[Candidate]]:
    """把候選分流成（乾淨→自動併 main、人名警示→開 PR），並寫出對應 state 檔。

    回傳 (clean, flagged)。呼叫前的殘留 state 檔會先清掉，確保 workflow 的
    檔案存在性 gate 只反映本輪結果。
    """
    _clear_state_files()

    clean = [c for c in candidates if not c.scrub.has_person]
    flagged = [c for c in candidates if c.scrub.has_person]

    # 乾淨候選 → 自動併 main（連同 manifest 一起）。即使 clean 為空，也要把 manifest
    # 帶進 main，讓變更偵測狀態前進。
    auto = [c.path for c in clean] + [manifest_path]
    _write_lines(AUTO_PATHS_PATH, auto)

    # 人名警示候選 → 只開 PR 給人審，不自動上站。
    if flagged:
        body = build_pr_body(source_name, flagged)
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(PR_BODY_PATH, "w", encoding="utf-8") as f:
            f.write(body)
        _write_lines(PR_PATHS_PATH, [c.path for c in flagged])

    return clean, flagged


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
        _clear_state_files()
        print(f"[{args.source}] 無變更，結束。")
        return 0

    clean, flagged = route_candidates(args.source, candidates, args.manifest)
    print(f"[{args.source}] 候選 {len(candidates)} 筆"
          f"（自動併 main {len(clean)}／人名待審開 PR {len(flagged)}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
