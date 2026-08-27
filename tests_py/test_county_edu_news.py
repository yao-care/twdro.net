import json

from pipeline.sources.county_edu_news import (
    CountyEduNews, ALERT_SLUG, _parse_rss, _parse_html,
)

# content_root 一律指向 tmp_path：預設值是 repo 根目錄，會讀到已提交的基準 alert 檔，
# 測試就跟 repo 實際狀態綁在一起（縣市多發一則公告就可能讓測試轉紅）。


def _raw(items, errors=None):
    return json.dumps(
        {"items": items, "errors": errors or []}, ensure_ascii=False, sort_keys=True
    ).encode("utf-8")


def test_rss_parsed_to_title_and_link():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>嘉義縣教育資訊網</title>
      <item><title>「嘉義縣115年度無人機足球競賽」成績公告</title>
            <link>https://www.cyc.edu.tw/modules/tadnews/index.php?nsn=92139</link></item>
      <item><title>轉知研習訊息</title><link>https://example.com/2</link></item>
    </channel></rss>"""
    got = _parse_rss(xml)
    assert len(got) == 2
    assert got[0]["title"] == "「嘉義縣115年度無人機足球競賽」成績公告"
    assert got[0]["link"].endswith("nsn=92139")


def test_rss_accepts_bytes_with_bom_and_encoding_declaration():
    """政府 .aspx feed 幾乎都帶 UTF-8 BOM——一個字元就能讓整個縣市靜默失聯。

    2026-08-03 屏東縣的實況：Content-Type 不帶 charset → requests 用 ISO-8859-1
    解碼 → BOM 變成 `ï»¿` 卡在 XML 宣告前 → ET ParseError → 該來源解析出 0 筆，
    而且因為 fetch 會沿用上輪清單，**不會有任何錯誤浮到檯面上**。
    修法是餵原始 bytes 讓 ET 依宣告自行解碼；這個測試把它釘死。
    """
    xml = ('<?xml version="1.0" encoding="utf-8"?>'
           '<rss version="2.0"><channel><title>最新消息</title>'
           '<item><title>115年度無人機足球競賽成績公告</title>'
           '<link>https://www.pthg.gov.tw/News_Content.aspx?n=1</link></item>'
           '</channel></rss>')
    raw = "﻿".encode("utf-8") + xml.encode("utf-8")
    got = _parse_rss(raw)
    assert [g["title"] for g in got] == ["115年度無人機足球競賽成績公告"]


def test_rss_str_input_with_encoding_declaration_still_parses():
    """測試裡直接寫 XML 字面值時，宣告的 encoding 會誤導 ET（字串早已解碼完畢）。"""
    xml = ('<?xml version="1.0" encoding="Big5"?>'
           '<rss><channel><item><title>無人機足球競賽</title><link>u</link></item></channel></rss>')
    assert [g["title"] for g in _parse_rss(xml)] == ["無人機足球競賽"]


def test_html_mode_decodes_by_meta_charset_when_header_omits_it():
    """html 模式不得用 res.text：header 沒 charset 時 requests 退回 ISO-8859-1，
    中文列表頁整頁亂碼、關鍵字一則都篩不到，而且是**靜默**失敗。"""
    from pipeline.sources.county_edu_news import _decode

    html = ('<html><head><meta charset="utf-8"></head><body>'
            '<a href="/news/1">115年度無人機足球競賽成績公告</a></body></html>')

    class _Res:
        content = html.encode("utf-8")
        headers = {"Content-Type": "text/html"}  # 刻意不帶 charset
        text = html.encode("utf-8").decode("iso-8859-1")  # requests 的錯誤退路

    got = _parse_html(_decode(_Res()), link_re=r"/news/")
    assert [g["title"] for g in got] == ["115年度無人機足球競賽成績公告"]


def test_rss_parse_error_returns_empty_not_raise():
    # 對方回 HTML 錯誤頁時不能炸掉整輪；回空清單交由 fetch 沿用上輪。
    assert _parse_rss("<html>503 Service Unavailable</html>") == []


def test_html_mode_filters_nav_links_by_regex_and_length():
    html = """
      <a href="/index.php">首頁</a>
      <a href="/modules/tadnews/index.php?nsn=1">115年度無人機足球競賽成績公告</a>
      <a href="/about">關於我們</a>
      <a href="/modules/tadnews/index.php?nsn=2">更多</a>
    """
    got = _parse_html(html, link_re=r"tadnews")
    # 「更多」長度不足被濾掉；非 tadnews 的導覽連結也被濾掉
    assert [g["title"] for g in got] == ["115年度無人機足球競賽成績公告"]


def test_matches_topic_and_flags_results(tmp_path):
    raw = _raw([
        {"feed": "嘉義縣教育資訊網", "title": "「嘉義縣115年度無人機足球競賽」成績公告",
         "link": "https://www.cyc.edu.tw/x?nsn=92139"},
        {"feed": "嘉義縣教育資訊網", "title": "轉知「教育部辦理115年無人機足球競賽-國中小組簡章」",
         "link": "https://example.com/2"},
        {"feed": "嘉義縣教育資訊網", "title": "本縣英語演說比賽得獎名單", "link": "https://example.com/3"},
    ])
    recs = CountyEduNews(content_root=str(tmp_path)).parse(raw)
    assert len(recs) == 1
    d = recs[0].data
    assert recs[0].slug == ALERT_SLUG
    # 第三則含「得獎」但與無人機足球無關 → 主題篩選要先擋掉，否則縣市公告會淹沒 alert
    assert d["matched_count"] == 2
    titles = [m["title"] for m in d["matched"]]
    assert "本縣英語演說比賽得獎名單" not in titles
    # 只有同時命中成績字樣的那則被標記
    assert [m["title"] for m in d["results_candidates"]] == [
        "「嘉義縣115年度無人機足球競賽」成績公告"
    ]


def test_known_list_kept_for_failsoft(tmp_path):
    raw = _raw([{"feed": "A", "title": "無人機足球競賽成績公告", "link": "u1"}])
    d = CountyEduNews(content_root=str(tmp_path)).parse(raw)[0].data
    assert len(d["known"]) == 1


def test_fetch_errors_surface_in_alert(tmp_path):
    raw = _raw([], errors=[{"feed": "南投縣", "error": "Timeout: ..."}])
    d = CountyEduNews(content_root=str(tmp_path)).parse(raw)[0].data
    assert d["matched_count"] == 0
    assert d["fetch_errors"][0]["feed"] == "南投縣"


def test_fetch_is_deterministic_for_change_detection(tmp_path, monkeypatch):
    """fetch 的輸出要能當變更偵測的 hash 依據——同樣的公告不論來源順序都要得到同一份 bytes。

    （抓取順序或 dict 排列造成 hash 每天變動，就會天天開一個沒有新東西的 PR。）
    """
    cfg = tmp_path / "feeds.yml"
    cfg.write_text(
        "feeds:\n  - label: A\n    url: https://a.example/rss\n    mode: rss\n"
        "  - label: B\n    url: https://b.example/rss\n    mode: rss\n",
        encoding="utf-8",
    )

    xml_a = ('<rss><channel><item><title>無人機足球競賽成績公告</title>'
             '<link>u1</link></item></channel></rss>')
    xml_b = '<rss><channel><item><title>研習公告事項</title><link>u2</link></item></channel></rss>'

    class _Res:
        def __init__(self, text):
            self.text = text
            self.content = text.encode("utf-8")
            self.headers = {"Content-Type": "application/xml; charset=utf-8"}
        def raise_for_status(self): return None

    def fake_get(url, **_kw):
        return _Res(xml_a if url.startswith("https://a.") else xml_b)

    monkeypatch.setattr("pipeline.sources.county_edu_news.requests.get", fake_get)
    src = CountyEduNews(config_path=str(cfg), content_root=str(tmp_path))
    assert src.fetch() == src.fetch()


def test_unrelated_announcements_do_not_change_the_hash(tmp_path, monkeypatch):
    """縣市教育網天天在發代理教師甄選公告——那些**不得**讓 fetch 的輸出改變。

    2026-08-03 首次實跑才發現的缺陷：主題篩選原本只做在 parse，於是 payload 含全部公告、
    hash 天天變，每天都會開一個 `matched: []` 的空 PR，一週內就沒人看了。篩選因此移進
    fetch。這個測試把它釘死。
    """
    cfg = tmp_path / "feeds.yml"
    cfg.write_text("feeds:\n  - label: A\n    url: https://a.example/rss\n    mode: rss\n",
                   encoding="utf-8")

    def _xml(extra_items: str) -> str:
        return ('<rss><channel>'
                '<item><title>115年度無人機足球競賽成績公告</title><link>u1</link></item>'
                f'{extra_items}</channel></rss>')

    day1 = _xml('<item><title>本縣國小代理教師甄選簡章</title><link>j1</link></item>')
    day2 = _xml('<item><title>本縣國中代理教師甄選簡章（第2次）</title><link>j2</link></item>'
                '<item><title>轉知英語研習活動</title><link>j3</link></item>')

    class _Res:
        def __init__(self, text):
            self.text = text
            self.content = text.encode("utf-8")
            self.headers = {"Content-Type": "application/xml; charset=utf-8"}
        def raise_for_status(self): return None

    body = {"v": day1}
    monkeypatch.setattr("pipeline.sources.county_edu_news.requests.get",
                        lambda url, **_kw: _Res(body["v"]))
    src = CountyEduNews(config_path=str(cfg), content_root=str(tmp_path))
    first = src.fetch()
    body["v"] = day2
    assert src.fetch() == first, "無關公告變動不該觸發告警"

    # 但真的多了一則無人機足球公告時，就必須偵測得到
    body["v"] = _xml('<item><title>無人機足球競賽實施計畫</title><link>u2</link></item>')
    assert src.fetch() != first


def test_fetch_errors_do_not_trigger_an_alert(tmp_path, monkeypatch):
    """縣市 feed 逾時／504 **不是**「有新公告」，不得觸發告警（2026-08-27）。

    PR #3 就是這樣來的：18 個來源裡有 5 個在 GitHub runner 上抓失敗（同一時間本機
    全部 200），fetch_errors 進了 payload → 指紋變 → 開出一個 matched: []、
    results_candidates: [] 的空 PR，內容只有錯誤訊息。錯誤仍要寫進 alert 檔供人
    診斷對方改版，但只有 items 進指紋。
    """
    cfg = tmp_path / "feeds.yml"
    cfg.write_text("feeds:\n  - label: A\n    url: https://a.example/rss\n    mode: rss\n"
                   "  - label: B\n    url: https://b.example/rss\n    mode: rss\n",
                   encoding="utf-8")

    xml_a = ('<rss><channel>'
             '<item><title>115年度無人機足球競賽成績公告</title><link>u1</link></item>'
             '</channel></rss>')
    # B 平時就沒有無人機足球公告（縣市來源絕大多數如此），所以它掛掉時 items 不變，
    # 兩輪之間唯一的差別就是 errors——正是 PR #3 的形狀。
    xml_b = '<rss><channel><item><title>本縣代理教師甄選簡章</title><link>j1</link></item></channel></rss>'

    class _Res:
        def __init__(self, text):
            self.text = text
            self.content = text.encode("utf-8")
            self.headers = {"Content-Type": "application/xml; charset=utf-8"}
        def raise_for_status(self): return None

    state = {"b_ok": True}

    def fake_get(url, **_kw):
        if url.startswith("https://b."):
            if not state["b_ok"]:
                raise RuntimeError("504 Server Error: Gateway Time-out")
            return _Res(xml_b)
        return _Res(xml_a)

    monkeypatch.setattr("pipeline.sources.county_edu_news.requests.get", fake_get)
    src = CountyEduNews(config_path=str(cfg), content_root=str(tmp_path))

    healthy = src.fetch()
    state["b_ok"] = False
    degraded = src.fetch()

    assert degraded != healthy, "錯誤仍要留在 payload 裡，人才看得到誰掛了"
    assert src.fingerprint(degraded) == src.fingerprint(healthy), "抓取錯誤不得觸發告警"
    assert "504" in json.loads(degraded.decode("utf-8"))["errors"][0]["error"]

    # 但真的多一則無人機足球公告時，指紋必須變。
    state["b_ok"] = True
    more = ('<rss><channel>'
            '<item><title>115年度無人機足球競賽成績公告</title><link>u1</link></item>'
            '<item><title>無人機足球競賽實施計畫</title><link>u2</link></item>'
            '</channel></rss>')
    monkeypatch.setattr("pipeline.sources.county_edu_news.requests.get",
                        lambda url, **_kw: _Res(more))
    assert src.fingerprint(src.fetch()) != src.fingerprint(healthy)
