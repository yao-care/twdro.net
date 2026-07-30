import json
import os

from pipeline.run import (
    _load_source, route_organizer_alerts,
    AUTO_PATHS_PATH, PR_PATHS_PATH, PR_BODY_PATH,
)
from pipeline.report import Candidate
from pipeline.scrub import ScrubResult
from pipeline.sources.organizer_articles import (
    OrganizerArticles, ALERT_SLUG, FINGERPRINT_FIELDS,
)


def _raw(articles: list) -> bytes:
    return json.dumps(articles, ensure_ascii=False).encode("utf-8")


def test_parse_emits_single_alert_and_marks_new():
    raw = _raw([
        {"id": 1, "slug": "kids-drone-benefits", "title": "小朋友玩無人機的好處",
         "publishedAt": "2025-07-12", "category": "教育培訓"},
        {"id": 2, "slug": "skycup-2026-taipei-results", "title": "2026 天穹盃臺北戰成績公告",
         "publishedAt": "2026-06-02", "category": "競技運動"},
    ])
    recs = OrganizerArticles().parse(raw)
    assert len(recs) == 1
    r = recs[0]
    assert r.slug == ALERT_SLUG
    # 只取標題/分類等中介資料 → 不跑 CKIP
    assert r.free_text_fields == []
    # 沒有上一輪 alert 檔 → 兩篇都算新
    assert r.data["new_count"] == 2
    assert "不改動站上任何資料" in r.data["note"]


def test_results_keyword_flags_candidate():
    raw = _raw([
        {"id": 1, "slug": "fpv-guide", "title": "競速無人機新手入門", "category": "教學指南"},
        {"id": 2, "slug": "skycup-nantou", "title": "南投戰冠軍出爐", "category": "競技運動"},
    ])
    r = OrganizerArticles().parse(raw)[0]
    assert r.data["results_candidates"] == ["skycup-nantou"]
    flags = {a["slug"]: a.get("looks_like_results", False) for a in r.data["articles"]}
    assert flags["skycup-nantou"] is True
    assert flags["fpv-guide"] is False


def test_known_slugs_are_not_reported_as_new(tmp_path):
    alert_dir = tmp_path / "pipeline" / "state" / "organizer-alerts"
    alert_dir.mkdir(parents=True)
    (alert_dir / f"{ALERT_SLUG}.yml").write_text(
        "articles:\n  - slug: fpv-guide\n", encoding="utf-8",
    )
    src = OrganizerArticles(content_root=str(tmp_path))
    raw = _raw([
        {"id": 1, "slug": "fpv-guide", "title": "舊文"},
        {"id": 2, "slug": "brand-new", "title": "新文"},
    ])
    r = src.parse(raw)[0]
    assert r.data["new_count"] == 1
    assert [a["slug"] for a in r.data["articles"] if a["is_new"]] == ["brand-new"]


# 指紋刻意排除文章本文：協會改一個錯字不該觸發告警，否則很快就沒人看。
def test_fingerprint_excludes_article_body():
    assert "content" not in FINGERPRINT_FIELDS
    assert "body" not in FINGERPRINT_FIELDS
    assert set(FINGERPRINT_FIELDS) == {"id", "title", "slug", "publishedAt", "category"}


def test_fetch_normalises_and_drops_body(monkeypatch):
    class FakeResp:
        def raise_for_status(self): pass
        def json(self):
            return [
                {"id": 2, "slug": "b", "title": "B", "content": "一大段本文",
                 "publishedAt": "2026-01-02", "category": "競技運動"},
                {"id": 1, "slug": "a", "title": "A", "content": "另一段本文"},
            ]
    monkeypatch.setattr("requests.get", lambda *a, **k: FakeResp())
    raw = OrganizerArticles().fetch()
    rows = json.loads(raw.decode("utf-8"))
    assert [r["slug"] for r in rows] == ["a", "b"]          # 依 slug 排序，hash 才穩定
    assert all("content" not in r for r in rows)             # 本文不進指紋


def test_fetch_accepts_data_wrapped_payload(monkeypatch):
    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"data": [{"id": 1, "slug": "a", "title": "A"}]}
    monkeypatch.setattr("requests.get", lambda *a, **k: FakeResp())
    rows = json.loads(OrganizerArticles().fetch().decode("utf-8"))
    assert [r["slug"] for r in rows] == ["a"]


# 抓取失敗沿用上次清單 → hash 不變 → 不會被誤判成「文章全刪」而發假告警。
def test_fetch_failure_falls_back_to_previous_slugs(tmp_path, monkeypatch):
    alert_dir = tmp_path / "pipeline" / "state" / "organizer-alerts"
    alert_dir.mkdir(parents=True)
    (alert_dir / f"{ALERT_SLUG}.yml").write_text(
        "articles:\n  - slug: a\n  - slug: b\n", encoding="utf-8",
    )

    def boom(*a, **k):
        raise RuntimeError("503")
    monkeypatch.setattr("requests.get", boom)
    rows = json.loads(
        OrganizerArticles(content_root=str(tmp_path)).fetch().decode("utf-8"))
    assert [r["slug"] for r in rows] == ["a", "b"]


def test_load_source_default_and_env(monkeypatch):
    monkeypatch.delenv("ORGANIZER_ARTICLES_URL", raising=False)
    src = _load_source("organizer_articles")
    assert isinstance(src, OrganizerArticles)
    assert "tdrupa.org" in src.url

    monkeypatch.setenv("ORGANIZER_ARTICLES_URL", "https://x.org/api/articles")
    assert _load_source("organizer_articles").url == "https://x.org/api/articles"


# 事實型資料（成績）絕不自動上站——站規鐵則 1。
def test_route_goes_to_pr_never_auto(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    c = Candidate(slug=ALERT_SLUG,
                  path=f"pipeline/state/organizer-alerts/{ALERT_SLUG}.yml",
                  changed=True, scrub=ScrubResult())
    route_organizer_alerts([c], "pipeline/state/manifest.json")
    assert not os.path.exists(AUTO_PATHS_PATH)        # 絕不自動併 main
    assert os.path.exists(PR_PATHS_PATH)
    body = open(PR_BODY_PATH, encoding="utf-8").read()
    assert "organizer_articles" in body
    assert "不得含選手姓名" in body                    # 個資紅線寫進 PR 審核步驟
    paths = open(PR_PATHS_PATH, encoding="utf-8").read().split()
    assert "pipeline/state/manifest.json" in paths     # manifest 一併 merge 才會收斂


def test_route_noop_when_no_candidates(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    route_organizer_alerts([], "pipeline/state/manifest.json")
    assert not os.path.exists(PR_PATHS_PATH)
    assert not os.path.exists(PR_BODY_PATH)
