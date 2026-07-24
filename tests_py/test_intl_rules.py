import json
import os

from pipeline.run import (
    _load_source, route_intl_alerts,
    AUTO_PATHS_PATH, PR_PATHS_PATH, PR_BODY_PATH,
)
from pipeline.report import Candidate
from pipeline.scrub import ScrubResult
from pipeline.sources.intl_rules import IntlRules, ALERT_SLUG


def _raw(pages: dict) -> bytes:
    return json.dumps(pages).encode("utf-8")


def test_parse_emits_single_alert_with_page_fingerprints():
    raw = _raw({
        "https://a.org/rules": {"hash": "aaa", "ok": True},
        "https://b.org/rulebook.pdf": {"hash": "bbb", "ok": True},
    })
    recs = IntlRules().parse(raw)
    assert len(recs) == 1
    r = recs[0]
    assert r.slug == ALERT_SLUG
    # 規則頁不涉個資 → 不跑 CKIP
    assert r.free_text_fields == []
    urls = [p["url"] for p in r.data["pages"]]
    assert urls == ["https://a.org/rules", "https://b.org/rulebook.pdf"]
    assert r.data["pages"][0]["content_hash"] == "aaa"
    assert "手動" in r.data["note"]


def test_prev_hashes_reads_last_alert(tmp_path):
    alert_dir = tmp_path / "pipeline" / "state" / "intl-alerts"
    alert_dir.mkdir(parents=True)
    (alert_dir / f"{ALERT_SLUG}.yml").write_text(
        "pages:\n"
        "  - url: https://a.org/rules\n    content_hash: oldhash\n",
        encoding="utf-8",
    )
    prev = IntlRules(content_root=str(tmp_path))._prev_hashes()
    assert prev == {"https://a.org/rules": "oldhash"}


def test_load_source_intl_default_and_env(monkeypatch):
    monkeypatch.delenv("INTL_RULE_URLS", raising=False)
    src = _load_source("fai_fida_rules")
    assert isinstance(src, IntlRules)
    assert any("dronesoccer.org" in u for u in src.urls)

    monkeypatch.setenv("INTL_RULE_URLS", "https://x.org/a, https://y.org/b")
    src2 = _load_source("fai_fida_rules")
    assert src2.urls == ["https://x.org/a", "https://y.org/b"]


def test_route_intl_alerts_goes_to_pr_never_auto(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    c = Candidate(slug=ALERT_SLUG,
                  path="pipeline/state/intl-alerts/rule-change-alert.yml",
                  changed=True, scrub=ScrubResult())
    route_intl_alerts([c], "pipeline/state/manifest.json")
    # 官方規則變更一律走 PR，絕不自動併 main
    assert not os.path.exists(AUTO_PATHS_PATH)
    pr_paths = open(PR_PATHS_PATH, encoding="utf-8").read()
    assert "rule-change-alert.yml" in pr_paths
    assert "pipeline/state/manifest.json" in pr_paths     # merge 後收斂變更偵測
    body = open(PR_BODY_PATH, encoding="utf-8").read()
    assert "切勿自動改寫官方規則" in body
