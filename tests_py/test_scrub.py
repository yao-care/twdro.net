from pipeline.scrub import scrub_record


def fake_ner(text: str):
    """測試用假 NER：把出現在名單中的字視為人名。"""
    names = ["王小明", "李大華"]
    return [n for n in names if n in text]


def test_flags_person_in_free_text():
    rec = {"title": "冠軍賽戰報", "description": "冠軍隊由王小明領軍奪冠。", "city": "臺北市"}
    r = scrub_record(rec, ["title", "description"], fake_ner)
    assert r.has_person is True
    assert "王小明" in r.persons
    assert "王小明" in r.fields["description"]


def test_clean_text_passes():
    rec = {"title": "賽事公告", "description": "本週六舉行分區賽。"}
    r = scrub_record(rec, ["title", "description"], fake_ner)
    assert r.has_person is False
    assert r.persons == []


def test_only_scans_named_fields():
    rec = {"description": "無人名", "note": "王小明"}
    r = scrub_record(rec, ["description"], fake_ner)  # note 不掃
    assert r.has_person is False
