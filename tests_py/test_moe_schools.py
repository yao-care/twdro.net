import json
from pipeline.sources.moe_schools import MoeSchools, _names_match


# 名錄 fixture：市立板橋國中（有隊伍、缺資料）、範例國中（無隊伍，應忽略）、
# 私立華興高級中學（有隊伍但站上已有 city+website，應 no-op 不重複產出）。
FIXTURE = json.dumps([
    {"學年度": "104", "代碼": "014501", "學校名稱": "市立板橋國中", "縣市名稱": "[01]新北市", "網址": "http://old.pcjh"},
    {"學年度": "113", "代碼": "014501", "學校名稱": "市立板橋國中", "縣市名稱": "[01]新北市", "網址": "http://www.pcjh.ntpc.edu.tw"},
    {"學年度": "113", "代碼": "999999", "學校名稱": "範例國中", "縣市名稱": "[18]新竹市", "網址": ""},
    {"學年度": "113", "代碼": "013303", "學校名稱": "私立華興高級中學", "縣市名稱": "[01]臺北市", "網址": "http://www.hhhs.tp.edu.tw"},
]).encode("utf-8")


def _targets(**schools):
    """建立 {校名: {"slug":.., "data":..}} 目標對照。"""
    return {name: {"slug": slug, "data": data} for name, (slug, data) in schools.items()}


def test_only_enriches_schools_with_teams():
    # 板橋國中有隊伍、缺 city/website → 產出補齊候選；範例國中無隊伍 → 忽略。
    targets = _targets(**{
        "板橋國中": ("banqiao-jhs", {"name": "板橋國中", "org_type": "school"}),
    })
    recs = MoeSchools(targets=targets).parse(FIXTURE)
    assert len(recs) == 1
    r = recs[0]
    assert r.slug == "banqiao-jhs"            # 寫回既有 org 檔，不新增
    assert r.data["city"] == "新北市"          # [01] 前綴已清除
    assert r.data["website"] == "http://www.pcjh.ntpc.edu.tw"  # 取最新學年度
    assert r.free_text_fields == []            # 學校無自由文字 → 不觸發人名閘門


def test_noop_when_school_already_complete():
    # 華興已有 city+website → 無可補 → 不產出候選（避免無謂 commit）。
    targets = _targets(**{
        "華興中學": ("hwahsing-school",
                    {"name": "華興中學", "org_type": "school",
                     "city": "臺北市", "website": "https://www.hhhs.tp.edu.tw"}),
    })
    recs = MoeSchools(targets=targets).parse(FIXTURE)
    assert recs == []


def test_does_not_overwrite_existing_values():
    # 已有 city 時不覆蓋，只補缺的 website。
    targets = _targets(**{
        "板橋國中": ("banqiao-jhs",
                    {"name": "板橋國中", "org_type": "school", "city": "既有縣市"}),
    })
    recs = MoeSchools(targets=targets).parse(FIXTURE)
    assert len(recs) == 1
    assert recs[0].data["city"] == "既有縣市"   # 不覆蓋
    assert recs[0].data["website"] == "http://www.pcjh.ntpc.edu.tw"  # 補缺


def test_no_targets_means_no_records():
    # 站上沒有任何有隊伍的學校 → 名錄一律不落地（絕不再灌整份名錄）。
    recs = MoeSchools(targets={}).parse(FIXTURE)
    assert recs == []


def test_name_matching_normalizes_prefixes():
    assert _names_match("市立板橋國中", "板橋國中")
    assert _names_match("私立華興高級中學", "華興中學")
    assert not _names_match("市立三光國中", "板橋國中")
