from pipeline.changedetect import content_hash, Manifest


def test_content_hash_stable():
    assert content_hash(b"hello") == content_hash(b"hello")
    assert content_hash(b"hello") != content_hash(b"world")


def test_manifest_detects_change(tmp_path):
    p = tmp_path / "manifest.json"
    m = Manifest.load(str(p))
    h1 = content_hash(b"v1")
    assert m.is_changed("src-a", h1) is True  # 新 key 視為變更
    m.set("src-a", h1)
    assert m.is_changed("src-a", h1) is False  # 相同 hash 無變更
    h2 = content_hash(b"v2")
    assert m.is_changed("src-a", h2) is True  # hash 變了
    m.save(str(p))
    m2 = Manifest.load(str(p))
    assert m2.get("src-a") == h1  # 存回讀回一致
