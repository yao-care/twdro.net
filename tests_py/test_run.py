from pipeline.run import _load_source, run_source
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
