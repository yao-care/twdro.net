from pipeline.report import Candidate, build_pr_body
from pipeline.scrub import ScrubResult


def test_pr_body_lists_and_flags():
    c1 = Candidate(slug="school-a", path="src/content/organizations/school-a.yml",
                   changed=True, scrub=ScrubResult(has_person=False))
    c2 = Candidate(slug="event-x", path="src/content/events/event-x.yml", changed=True,
                   scrub=ScrubResult(has_person=True, persons=["王小明"], fields={"description": ["王小明"]}))
    body = build_pr_body("moe_schools", [c1, c2])
    assert "moe_schools" in body
    assert "school-a" in body
    assert "王小明" in body           # 人名警示
    assert "人工審核" in body          # 審核提醒
    assert "⚠️" in body               # 有人名者標記
