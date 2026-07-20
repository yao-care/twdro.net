import json
from pipeline.sources.announcements import EventAnnouncements, _strip_html, _slug


def _raw(pages: dict) -> bytes:
    return json.dumps(pages).encode("utf-8")


def test_extracts_event_title_and_date_clue():
    html = (
        '<html><body><h2>轉知</h2>'
        '<p>台灣無人機競技發展協會辦理「2026第二屆天穹盃無人機飛球錦標賽－台南戰」，'
        '訂於115年7月11日舉行，請踴躍報名。</p></body></html>'
    )
    recs = EventAnnouncements().parse(_raw({"https://ex.edu.tw/a.php": html}))
    assert len(recs) == 1
    d = recs[0].data
    assert d["title"] == "2026第二屆天穹盃無人機飛球錦標賽－台南戰"
    assert d["status"] == "draft"
    assert d["rule_system"] == "OTHER"
    assert d["verification"] == "unverified"
    assert d["sources"][0]["url"] == "https://ex.edu.tw/a.php"
    assert "115年7月11日" in d["subtitle"]
    assert recs[0].slug.startswith("draft-")
    # 人名警示欄位有列出（供 CKIP scrub）
    assert "title" in recs[0].free_text_fields


def test_dedupes_same_title_across_pages():
    html = '「2026天穹盃無人機飛球賽－新北戰」相關公告'
    recs = EventAnnouncements().parse(_raw({
        "https://a.edu.tw": html,
        "https://b.edu.tw": html,
    }))
    assert len(recs) == 1


def test_ignores_non_event_brackets():
    html = '<p>「校長的話」與「無人機社團招生」不是賽事，但「無人機足球錦標賽」是。</p>'
    recs = EventAnnouncements().parse(_raw({"https://x.edu.tw": html}))
    titles = [r.data["title"] for r in recs]
    assert titles == ["無人機足球錦標賽"]


def test_extracts_unbracketed_title():
    # 真實學校頁常把賽事名當純標題（不加「」），也要能擷取
    html = '<h1>第三屆臺灣教育科技盃無人機足球--新北地區公開賽</h1><p>報名自115年6月起。</p>'
    recs = EventAnnouncements().parse(_raw({"https://www.jges.ntpc.edu.tw/x.php": html}))
    titles = [r.data["title"] for r in recs]
    assert "第三屆臺灣教育科技盃無人機足球--新北地區公開賽" in titles


def test_strip_html_removes_tags():
    assert _strip_html("<b>你好</b><br>世界") .strip() == "你好 世界"


def test_slug_is_ascii_stable():
    assert _slug("天穹盃") == _slug("天穹盃")
    assert _slug("天穹盃") != _slug("教科盃")
