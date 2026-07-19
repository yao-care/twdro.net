import yaml
from pipeline.emit import to_yaml, write_candidate


def test_dates_are_quoted_strings():
    out = to_yaml({"name": "示範學校", "published_at": "2026-05-25"})
    # 反序列化後日期應為 str，不是 datetime.date
    loaded = yaml.safe_load(out)
    assert isinstance(loaded["published_at"], str)
    assert loaded["published_at"] == "2026-05-25"
    assert loaded["name"] == "示範學校"


def test_write_candidate(tmp_path):
    path = write_candidate({"name": "X", "org_type": "school"}, str(tmp_path), "demo")
    assert path.endswith("demo.yml")
    loaded = yaml.safe_load(open(path, encoding="utf-8"))
    assert loaded["org_type"] == "school"
