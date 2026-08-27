import json

from pipeline.sources.news_watch import NewsWatch, ALERT_SLUG, MAX_KNOWN

# content_root 一律指向 tmp_path：預設值是 repo 根目錄，會讀到已提交的基準 alert 檔，
# 測試就跟每天變動的新聞綁在一起（那個檔天天都在變）。


class _Res:
    def __init__(self, text):
        self.text = text
        self.content = text.encode("utf-8")
        self.headers = {"Content-Type": "application/xml; charset=utf-8"}

    def raise_for_status(self):
        return None


def _cfg(tmp_path, extra=""):
    p = tmp_path / "news.yml"
    p.write_text("sources:\n  - label: A\n    mode: google_news\n    query: 無人機足球\n" + extra,
                 encoding="utf-8")
    return p


def _rss(*titles):
    items = "".join(f"<item><title>{t}</title><link>https://e/{i}</link></item>"
                    for i, t in enumerate(titles))
    return f"<rss><channel>{items}</channel></rss>"


def test_only_topic_titles_enter_the_fingerprint(tmp_path, monkeypatch):
    """新聞聚合器每天都在流動，但**不相關的新聞不得讓指紋改變**。

    這是 county_edu_news 已經踩過的坑（主題篩選必須在 fetch 做）：不篩的話，
    每天都會開一個沒有任何無人機足球消息的空 PR，一週內就沒人看了。
    """
    body = {"v": _rss("無人機足球全國賽開打", "今日股市收盤")}
    monkeypatch.setattr("pipeline.sources.news_watch.requests.get",
                        lambda url, **_kw: _Res(body["v"]))
    src = NewsWatch(config_path=str(_cfg(tmp_path)), content_root=str(tmp_path))
    first = src.fetch()
    body["v"] = _rss("無人機足球全國賽開打", "颱風假消息")
    assert src.fetch() == first, "無關新聞變動不該觸發告警"

    body["v"] = _rss("無人機足球全國賽開打", "天穹盃無人機飛球成績公布")
    assert src.fetch() != first, "真的多一則相關消息時必須偵測得到"


def test_fetch_errors_do_not_trigger_an_alert(tmp_path, monkeypatch):
    """來源掛掉不是「有新消息」。錯誤仍寫進 alert 檔給人診斷，但不進指紋。"""
    def fake_get(url, **_kw):
        raise RuntimeError("504 Server Error")
    monkeypatch.setattr("pipeline.sources.news_watch.requests.get", fake_get)
    src = NewsWatch(config_path=str(_cfg(tmp_path)), content_root=str(tmp_path))
    raw = src.fetch()
    payload = json.loads(raw.decode("utf-8"))
    assert payload["items"] == []
    assert "504" in payload["errors"][0]["error"]
    assert json.loads(src.fingerprint(raw).decode("utf-8")) == {"items": []}


def test_parse_marks_new_titles_and_result_candidates(tmp_path, monkeypatch):
    body = {"v": _rss("無人機足球全國賽開打")}
    monkeypatch.setattr("pipeline.sources.news_watch.requests.get",
                        lambda url, **_kw: _Res(body["v"]))
    src = NewsWatch(config_path=str(_cfg(tmp_path)), content_root=str(tmp_path))
    rec = src.parse(src.fetch())[0]
    assert rec.slug == ALERT_SLUG
    assert rec.data["new_count"] == 1
    assert rec.data["new_items"][0]["is_new"] is True
    assert rec.data["results_candidates"] == []

    # 把這一輪寫成 known 之後，同一則不再算新的；含成績字樣的新標題要被標出來。
    (tmp_path / "pipeline" / "state" / "news-alerts").mkdir(parents=True, exist_ok=True)
    import yaml
    (tmp_path / "pipeline" / "state" / "news-alerts" / f"{ALERT_SLUG}.yml").write_text(
        yaml.safe_dump({"known": rec.data["known"]}, allow_unicode=True), encoding="utf-8")
    body["v"] = _rss("無人機足球全國賽開打", "無人機足球全國賽成績公布 冠軍出爐")
    rec2 = src.parse(src.fetch())[0]
    assert rec2.data["new_count"] == 1
    assert rec2.data["results_candidates"][0]["looks_like_results"] is True


def test_known_list_is_capped(tmp_path, monkeypatch):
    """Google News 一個查詢就回上百則；known 不設限這個檔會無限長大，diff 也沒人看得完。"""
    body = _rss(*[f"無人機足球第 {i} 則" for i in range(MAX_KNOWN + 50)])
    monkeypatch.setattr("pipeline.sources.news_watch.requests.get",
                        lambda url, **_kw: _Res(body))
    src = NewsWatch(config_path=str(_cfg(tmp_path)), content_root=str(tmp_path))
    rec = src.parse(src.fetch())[0]
    assert len(rec.data["known"]) == MAX_KNOWN
