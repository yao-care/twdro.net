import json
from pipeline.sources.moe_schools import MoeSchools


def test_parse_makes_organization_records():
    fixture = json.dumps([
        {"學校名稱": "臺北市立示範國中", "縣市名稱": "臺北市", "網址": "https://demo.tp.edu.tw"},
        {"學校名稱": "新竹市立範例國小", "縣市名稱": "新竹市", "網址": ""},
    ]).encode("utf-8")
    recs = MoeSchools().parse(fixture)
    assert len(recs) == 2
    a = recs[0]
    assert a.data["name"] == "臺北市立示範國中"
    assert a.data["org_type"] == "school"
    assert a.data["city"] == "臺北市"
    assert a.data["website"] == "https://demo.tp.edu.tw"
    # slug 為可讀化
    assert a.slug
    # 無網址者不應有空字串 website
    assert "website" not in recs[1].data or recs[1].data.get("website")


def test_out_dir_targets_organizations():
    assert MoeSchools().out_dir.endswith("organizations")
