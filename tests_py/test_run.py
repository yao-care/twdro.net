import os

from pipeline.run import (
    _load_source, run_source, route_candidates,
    AUTO_PATHS_PATH, PR_PATHS_PATH, PR_BODY_PATH,
)
from pipeline.report import Candidate
from pipeline.scrub import ScrubResult
from pipeline.sources.base import Record


class FakeSource:
    name = "fake"

    def __init__(self, out_dir, raw, records):
        self.out_dir = out_dir
        self._raw = raw
        self._records = records

    def fetch(self):
        return self._raw

    def parse(self, raw):
        return self._records


def no_person_ner(text):
    return []


def person_ner(text):
    return ["王小明"] if "王小明" in text else []


def test_run_emits_candidates_and_detects_change(tmp_path):
    recs = [Record(slug="a", data={"name": "校 A", "org_type": "school"}, raw=b"v1", free_text_fields=[])]
    src = FakeSource(str(tmp_path / "out"), b"v1", recs)
    mpath = str(tmp_path / "manifest.json")
    cands, changed = run_source(src, mpath, no_person_ner)
    assert changed is True
    assert len(cands) == 1
    assert cands[0].scrub.has_person is False
    # 再跑一次同資料 → 無變更
    cands2, changed2 = run_source(src, mpath, no_person_ner)
    assert changed2 is False
    assert cands2 == []


def test_run_flags_person(tmp_path):
    recs = [Record(slug="e", data={"title": "戰報", "description": "王小明奪冠"},
                   raw=b"vx", free_text_fields=["title", "description"])]
    src = FakeSource(str(tmp_path / "out"), b"vx", recs)
    cands, changed = run_source(src, str(tmp_path / "m.json"), person_ner)
    assert changed is True
    assert cands[0].scrub.has_person is True
    assert "王小明" in cands[0].scrub.persons


def _cand(slug, path, person=False):
    return Candidate(slug=slug, path=path, changed=True,
                     scrub=ScrubResult(has_person=person,
                                       persons=["王小明"] if person else []))


def test_route_clean_goes_to_auto_flagged_goes_to_pr(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    clean_c = _cand("draft-a", "src/content/events/draft-a.yml", person=False)
    flag_c = _cand("draft-b", "src/content/events/draft-b.yml", person=True)
    clean, flagged = route_candidates("event_announcements", [clean_c, flag_c],
                                      "pipeline/state/manifest.json")
    assert [c.slug for c in clean] == ["draft-a"]
    assert [c.slug for c in flagged] == ["draft-b"]

    auto = open(AUTO_PATHS_PATH, encoding="utf-8").read()
    assert "src/content/events/draft-a.yml" in auto      # 乾淨候選自動併 main
    assert "pipeline/state/manifest.json" in auto        # manifest 一併帶進 main
    assert "draft-b.yml" not in auto                      # 人名警示不進自動路徑

    pr_paths = open(PR_PATHS_PATH, encoding="utf-8").read()
    assert "src/content/events/draft-b.yml" in pr_paths
    body = open(PR_BODY_PATH, encoding="utf-8").read()
    assert "王小明" in body                                # PR 內文標出人名


def test_route_all_clean_writes_no_pr(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    c = _cand("hwahsing-school", "src/content/organizations/hwahsing-school.yml")
    clean, flagged = route_candidates("moe_schools", [c], "pipeline/state/manifest.json")
    assert flagged == []
    # 全乾淨 → 只有自動路徑，沒有 PR 檔（workflow 不會開 PR）
    assert os.path.exists(AUTO_PATHS_PATH)
    assert not os.path.exists(PR_PATHS_PATH)
    assert not os.path.exists(PR_BODY_PATH)


def test_load_source_uses_default_without_env(monkeypatch):
    # 未設環境變數時仍載入來源（用教育部統計處內建預設 URL）。
    monkeypatch.delenv("MOE_SCHOOLS_URL", raising=False)
    src = _load_source("moe_schools")
    assert src is not None
    assert "stats.moe.gov.tw" in src.url


def test_load_source_honors_env(monkeypatch):
    monkeypatch.setenv("MOE_SCHOOLS_URL", "https://example.org/custom.json")
    src = _load_source("moe_schools")
    assert src.url == "https://example.org/custom.json"
