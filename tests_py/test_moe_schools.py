import json
from pipeline.sources.moe_schools import MoeSchools


def test_parse_makes_organization_records():
    # 真實資料形態：縣市帶 [代碼] 前綴、含多學年度需去重。
    fixture = json.dumps([
        {"學年度": "104", "代碼": "014501", "學校名稱": "市立板橋國中", "縣市名稱": "[01]新北市", "網址": "http://www.pcjh.ntpc.edu.tw"},
        {"學年度": "113", "代碼": "014501", "學校名稱": "市立板橋國中", "縣市名稱": "[01]新北市", "網址": "http://www.pcjh.ntpc.edu.tw"},
        {"學年度": "113", "代碼": "999999", "學校名稱": "範例國中", "縣市名稱": "[18]新竹市", "網址": ""},
    ]).encode("utf-8")
    recs = MoeSchools().parse(fixture)
    by_name = {r.data["name"]: r for r in recs}
    # 板橋國中同代碼跨兩學年度 → 去重成 1 筆
    assert len(recs) == 2
    a = by_name["市立板橋國中"]
    assert a.data["org_type"] == "school"
    assert a.data["city"] == "新北市"          # [01] 前綴已清除
    assert a.data["website"] == "http://www.pcjh.ntpc.edu.tw"
    assert a.slug
    # 空網址不輸出 website 欄位
    assert "website" not in by_name["範例國中"].data


def test_out_dir_targets_organizations():
    assert MoeSchools().out_dir.endswith("organizations")


def test_default_url_is_moe_stats():
    assert "stats.moe.gov.tw" in MoeSchools().url
