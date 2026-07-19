# twdro.net 計畫三：資料 Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 建立半自動資料取得 pipeline：GitHub Actions 排程抓取 → 正規化 → CKIP 人名偵測 → 變更偵測 → 開 PR（人工審核閘門），三層個資防護，發佈永遠有人。

**Architecture:** 獨立 Python 套件 `pipeline/`（與 Node 網站分離）。核心邏輯離線可測（fixture + mock NER），來源 adapter 與 NER backend 皆可插拔。CKIP（torch）僅在 CI 安裝；本地測試用 mock NER。pipeline 產出「候選 YAML」寫入 `src/content/**` 並開 PR，人工 merge 前不上站。

**Tech Stack:** Python 3.11（CI）/3.x（本地測試）、pytest、PyYAML、requests、ckip-transformers（CI only）、GitHub Actions、peter-evans/create-pull-request。

## Global Constraints

- pipeline 只到「開 PR」為止；跨過 PR 人工閘門才可 merge 上站。自動化 = 發現＋存證＋警示，發佈永遠有人。
- 三層個資防護：(1) 目標 schema 無選手個資欄位；(2) CKIP NER 掃自由文字人名 → 標記擋 PR；(3) 人工審核。**CKIP 只標記不自動塗改**（v1 量低，保留可稽核原文）。
- 候選 YAML 必須符合網站既有 Zod schema（`organizations`：`name, org_type, city?, website?`；`events` 等）。日期一律加引號字串。
- **不 rehost 官方 PDF**：只記 URL + hash + retrieved_at 存證。
- **不爬社群/學校公告牆**：僅政府開放資料、官方頁面 hash 監控。遵守來源 ToS，不高頻爬取。
- Python 程式碼：型別註記、docstring；離線測試不得依賴網路或 torch。
- commit message 用繁中，結尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 目錄結構（本計畫建立）

```text
pipeline/
├── __init__.py
├── changedetect.py      # content_hash + manifest 變更偵測
├── emit.py              # record → 候選 YAML
├── scrub.py             # NER backend 協定 + CKIP + scrub 邏輯
├── report.py            # PR body 產生
├── run.py               # orchestrator（CLI）
├── sources/
│   ├── __init__.py
│   ├── base.py          # Source 協定 + Record dataclass
│   └── moe_schools.py   # 政府開放資料：學校 → organizations
├── state/
│   └── manifest.json    # 變更偵測狀態（committed）
├── requirements.txt     # CI 用（含 ckip-transformers, torch）
└── requirements-dev.txt # 本地測試用（pytest, pyyaml, requests）
tests_py/
├── test_changedetect.py
├── test_emit.py
├── test_scrub.py
├── test_report.py
├── test_moe_schools.py
└── test_run.py
pytest.ini
```

---

### Task 1: pipeline 套件骨架 + 變更偵測

**Files:**
- Create: `pipeline/__init__.py`（空）
- Create: `pipeline/changedetect.py`
- Create: `pipeline/requirements-dev.txt`
- Create: `pytest.ini`
- Test: `tests_py/test_changedetect.py`

**Interfaces:**
- Produces:
  - `content_hash(data: bytes) -> str`（sha256 hex）
  - `class Manifest`：`load(path) -> Manifest`、`get(key) -> str|None`、`set(key, hash)`、`is_changed(key, hash) -> bool`、`save(path)`。
  - 後續 Task 6 orchestrator 使用。

- [ ] **Step 1：建立 `pipeline/requirements-dev.txt`**

```text
pytest>=8
PyYAML>=6
requests>=2.31
```

- [ ] **Step 2：建立 `pytest.ini`**

```ini
[pytest]
testpaths = tests_py
python_files = test_*.py
pythonpath = .
```
（`pythonpath = .` 讓 `from pipeline...` 能從 repo root import。）

- [ ] **Step 3：建立 `pipeline/__init__.py`（空檔）**

```python
```

- [ ] **Step 4：寫失敗測試 `tests_py/test_changedetect.py`**

```python
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
```

- [ ] **Step 5：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_changedetect.py -q`
Expected: FAIL（模組不存在）。若 pytest 未裝：`python3 -m pip install -r pipeline/requirements-dev.txt` 後再跑。

- [ ] **Step 6：建立 `pipeline/changedetect.py`**

```python
"""內容雜湊與變更偵測。官方文件 hash 變了就視為新版本，不覆寫舊版。"""
from __future__ import annotations
import hashlib
import json
import os
from typing import Optional


def content_hash(data: bytes) -> str:
    """回傳資料的 sha256 十六進位字串。"""
    return "sha256:" + hashlib.sha256(data).hexdigest()


class Manifest:
    """記錄每個來源 key 的最後已知 hash，用於變更偵測。"""

    def __init__(self, data: Optional[dict] = None) -> None:
        self._data: dict[str, str] = dict(data or {})

    @classmethod
    def load(cls, path: str) -> "Manifest":
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return cls(json.load(f))
        return cls()

    def get(self, key: str) -> Optional[str]:
        return self._data.get(key)

    def set(self, key: str, hash_value: str) -> None:
        self._data[key] = hash_value

    def is_changed(self, key: str, hash_value: str) -> bool:
        """key 不存在（新來源）或 hash 不同 → 視為變更。"""
        return self._data.get(key) != hash_value

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2, sort_keys=True)
```

- [ ] **Step 7：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_changedetect.py -q`
Expected: PASS

- [ ] **Step 8：建立初始 `pipeline/state/manifest.json`**

```json
{}
```

- [ ] **Step 9：Commit**

```bash
git add -A
git commit -m "feat: pipeline 骨架與變更偵測（content_hash + Manifest）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 候選 YAML 產出（emit）

**Files:**
- Create: `pipeline/emit.py`
- Test: `tests_py/test_emit.py`

**Interfaces:**
- Consumes: PyYAML。
- Produces:
  - `to_yaml(record: dict) -> str`（日期值加引號；ensure ascii off；穩定 key 順序）
  - `write_candidate(record: dict, out_dir: str, slug: str) -> str`（寫 `out_dir/slug.yml`，回傳路徑）
  - `DATE_KEYS`（需加引號的日期欄位集合）。

- [ ] **Step 1：寫失敗測試 `tests_py/test_emit.py`**

```python
import yaml
from pipeline.emit import to_yaml, write_candidate


def test_dates_are_quoted_strings():
    out = to_yaml({"name": "示範學校", "published_at": "2026-05-25"})
    # 反序列化後日期應為 str，不是 datetime.date
    loaded = yaml.safe_load(out)
    assert isinstance(loaded["published_at"], str)
    assert loaded["published_at"] == "2026-05-25"
    assert loaded["name"] == "示範學校"


def test_write_candidate(tmp_path):
    path = write_candidate({"name": "X", "org_type": "school"}, str(tmp_path), "demo")
    assert path.endswith("demo.yml")
    loaded = yaml.safe_load(open(path, encoding="utf-8"))
    assert loaded["org_type"] == "school"
```

- [ ] **Step 2：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_emit.py -q`
Expected: FAIL

- [ ] **Step 3：建立 `pipeline/emit.py`**

```python
"""將正規化 record 產出為候選 YAML（符合網站 content schema）。"""
from __future__ import annotations
import os
import re
from typing import Any

import yaml

# 這些欄位若為日期字串，YAML 需加引號避免被解析成 date 物件（撞網站 z.string()）。
DATE_KEYS = {"published_at", "retrieved_at", "effective_from", "effective_to",
             "registration_start", "registration_end", "event_start", "event_end",
             "founded_at", "verified_at", "updated_at"}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


class _QuotedStr(str):
    """標記為需強制加引號輸出的字串。"""


def _quoted_representer(dumper: yaml.Dumper, data: _QuotedStr):
    return dumper.represent_scalar("tag:yaml.org,2002:str", str(data), style='"')


yaml.add_representer(_QuotedStr, _quoted_representer)


def _mark_dates(obj: Any) -> Any:
    """遞迴將日期欄位值標記為強制加引號字串。"""
    if isinstance(obj, dict):
        return {k: (_QuotedStr(v) if (k in DATE_KEYS and isinstance(v, str) and _DATE_RE.match(v)) else _mark_dates(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mark_dates(x) for x in obj]
    return obj


def to_yaml(record: dict) -> str:
    """回傳 record 的 YAML 字串；日期欄位強制加引號。"""
    marked = _mark_dates(record)
    return yaml.dump(marked, allow_unicode=True, sort_keys=False, default_flow_style=False)


def write_candidate(record: dict, out_dir: str, slug: str) -> str:
    """把 record 寫成 out_dir/slug.yml，回傳檔案路徑。"""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{slug}.yml")
    with open(path, "w", encoding="utf-8") as f:
        f.write(to_yaml(record))
    return path
```

- [ ] **Step 4：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_emit.py -q`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: pipeline 候選 YAML 產出（日期加引號）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CKIP 人名偵測層（scrub，可插拔 NER）

**Files:**
- Create: `pipeline/scrub.py`
- Test: `tests_py/test_scrub.py`

**Interfaces:**
- Produces:
  - `class ScrubResult`（dataclass）：`has_person: bool`、`persons: list[str]`、`fields: dict[str, list[str]]`（欄位→偵測到的人名）。
  - `NER = Callable[[str], list[str]]`（輸入文字，回傳人名 list）——可插拔。
  - `scrub_record(record: dict, free_text_fields: list[str], ner: NER) -> ScrubResult`：只掃指定自由文字欄位。
  - `ckip_ner() -> NER`：延遲載入 ckip-transformers（僅 CI/正式用；本地測試用 mock）。
- 本地測試以 **mock NER** 驗證掃描邏輯，不需 torch。

- [ ] **Step 1：寫失敗測試 `tests_py/test_scrub.py`**

```python
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
```

- [ ] **Step 2：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_scrub.py -q`
Expected: FAIL

- [ ] **Step 3：建立 `pipeline/scrub.py`**

```python
"""第二層個資防護：CKIP NER 掃自由文字人名 → 標記（不自動塗改）。

本地測試以 mock NER 驗證掃描邏輯；CKIP（torch）僅在 CI/正式環境延遲載入。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable

NER = Callable[[str], list[str]]


@dataclass
class ScrubResult:
    has_person: bool = False
    persons: list[str] = field(default_factory=list)
    fields: dict[str, list[str]] = field(default_factory=dict)


def scrub_record(record: dict, free_text_fields: list[str], ner: NER) -> ScrubResult:
    """對 record 的指定自由文字欄位跑 NER，收集偵測到的人名。

    只標記、不修改 record（保留可稽核原文）；有人名 → has_person=True，
    orchestrator 依此擋自動 merge、進審核佇列。
    """
    result = ScrubResult()
    seen: set[str] = set()
    for key in free_text_fields:
        val = record.get(key)
        if not isinstance(val, str) or not val:
            continue
        found = [n for n in ner(val) if n]
        if found:
            result.fields[key] = found
            for n in found:
                if n not in seen:
                    seen.add(n)
                    result.persons.append(n)
    result.has_person = len(result.persons) > 0
    return result


def ckip_ner() -> NER:
    """回傳以 CKIP Transformers 為後端的 NER 函式（延遲載入 torch/模型）。

    僅在 CI/正式環境呼叫；本地離線測試請改傳 mock NER。
    """
    from ckip_transformers.nlp import CkipNerChunker  # 延遲 import，避免本地需要 torch

    chunker = CkipNerChunker(model="bert-base")

    def _ner(text: str) -> list[str]:
        entities = chunker([text])[0]
        return [e.word for e in entities if e.ner == "PERSON"]

    return _ner
```

- [ ] **Step 4：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_scrub.py -q`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: CKIP 人名偵測層（可插拔 NER，只標記不塗改）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: PR body 產生（report）

**Files:**
- Create: `pipeline/report.py`
- Test: `tests_py/test_report.py`

**Interfaces:**
- Consumes: `ScrubResult`（Task 3）。
- Produces:
  - `class Candidate`（dataclass）：`slug: str`、`path: str`、`changed: bool`、`scrub: ScrubResult`。
  - `build_pr_body(source: str, candidates: list[Candidate]) -> str`：Markdown，列出候選、標紅有人名者、附審核提醒。

- [ ] **Step 1：寫失敗測試 `tests_py/test_report.py`**

```python
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
```

- [ ] **Step 2：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_report.py -q`
Expected: FAIL

- [ ] **Step 3：建立 `pipeline/report.py`**

```python
"""產生 PR body：列出候選資料、標記 CKIP 偵測到人名者、附審核提醒。"""
from __future__ import annotations
from dataclasses import dataclass

from pipeline.scrub import ScrubResult


@dataclass
class Candidate:
    slug: str
    path: str
    changed: bool
    scrub: ScrubResult


def build_pr_body(source: str, candidates: list[Candidate]) -> str:
    lines: list[str] = []
    lines.append(f"## 資料 pipeline 候選：`{source}`")
    lines.append("")
    lines.append("> 本 PR 由 pipeline 自動產生，**尚未上站**。請人工審核後再 merge。")
    lines.append("")
    flagged = [c for c in candidates if c.scrub.has_person]
    if flagged:
        lines.append("### ⚠️ CKIP 偵測到可能的人名（個資警示）")
        lines.append("")
        lines.append("以下候選含疑似人名，merge 前務必收斂成隊伍層級或移除：")
        for c in flagged:
            names = "、".join(c.scrub.persons)
            lines.append(f"- ⚠️ `{c.slug}`（{c.path}）：{names}")
            for fld, ns in c.scrub.fields.items():
                lines.append(f"    - 欄位 `{fld}`：{'、'.join(ns)}")
        lines.append("")
    lines.append("### 全部候選")
    lines.append("")
    for c in candidates:
        mark = "⚠️" if c.scrub.has_person else "✅"
        state = "變更/新增" if c.changed else "無變更"
        lines.append(f"- {mark} `{c.slug}` — {state} — `{c.path}`")
    lines.append("")
    lines.append("---")
    lines.append("**審核清單**：資料來源正確？規則體系未混用？無選手個資？日期已加引號？")
    lines.append("務必經過**人工審核**再 merge，pipeline 不自動發佈。")
    return "\n".join(lines)
```

- [ ] **Step 4：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_report.py -q`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: pipeline PR body 產生（人名警示 + 審核提醒）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 來源 adapter 協定 + 政府開放資料（學校）

**Files:**
- Create: `pipeline/sources/__init__.py`（空）
- Create: `pipeline/sources/base.py`
- Create: `pipeline/sources/moe_schools.py`
- Test: `tests_py/test_moe_schools.py`

**Interfaces:**
- Produces:
  - `base.py`：`@dataclass Record`（`slug: str`、`data: dict`、`raw: bytes`、`free_text_fields: list[str]`）；`Source` 協定：`name: str`、`out_dir: str`、`fetch() -> bytes`、`parse(raw: bytes) -> list[Record]`。
  - `moe_schools.py`：`class MoeSchools(Source)`。`fetch()` 抓政府開放資料學校清單（正式）；`parse()` 從 JSON 產出 `organizations` record（`name, org_type='school', city, website?`）。`parse` 以 fixture 離線測試。

- [ ] **Step 1：建立 `pipeline/sources/__init__.py`（空檔）**

```python
```

- [ ] **Step 2：建立 `pipeline/sources/base.py`**

```python
"""來源 adapter 協定與 Record 型別。"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Record:
    slug: str
    data: dict
    raw: bytes = b""
    free_text_fields: list[str] = field(default_factory=list)


class Source(Protocol):
    name: str
    out_dir: str

    def fetch(self) -> bytes:
        """抓取原始資料（bytes），供 hash 存證與 parse。"""
        ...

    def parse(self, raw: bytes) -> list[Record]:
        """把原始資料正規化成 Record 清單。"""
        ...
```

- [ ] **Step 3：寫失敗測試 `tests_py/test_moe_schools.py`**

```python
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
```

- [ ] **Step 4：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_moe_schools.py -q`
Expected: FAIL

- [ ] **Step 5：建立 `pipeline/sources/moe_schools.py`**

```python
"""政府開放資料：學校基本資料 → organizations 主檔。

用途：建立學校資料庫、對應隊伍所屬學校、避免使用者每次自由輸入校名。
僅索引用途、遵守來源 ToS，不高頻爬取。
"""
from __future__ import annotations
import json
import re

import requests

from pipeline.sources.base import Record, Source

# 政府資料開放平臺「高級中等以下學校名錄」類資源（示範用；正式部署可換成明確資源 URL）。
DATA_URL = "https://data.gov.tw/api/v2/rest/datastore/"  # 佔位；workflow 以環境變數覆寫


def _slugify(name: str) -> str:
    s = re.sub(r"\s+", "-", name.strip())
    s = re.sub(r"[^0-9A-Za-z一-鿿-]", "", s)
    return s or "school"


class MoeSchools:
    name = "moe_schools"
    out_dir = "src/content/organizations"

    def __init__(self, url: str = DATA_URL) -> None:
        self.url = url

    def fetch(self) -> bytes:
        """抓取學校清單原始 JSON（bytes）。正式部署由 workflow 設定實際資源 URL。"""
        resp = requests.get(self.url, timeout=30, headers={"User-Agent": "twdro-pipeline/1.0"})
        resp.raise_for_status()
        return resp.content

    def parse(self, raw: bytes) -> list[Record]:
        """把學校 JSON 正規化為 organizations record。"""
        rows = json.loads(raw.decode("utf-8"))
        records: list[Record] = []
        for row in rows:
            name = (row.get("學校名稱") or row.get("name") or "").strip()
            if not name:
                continue
            data: dict = {"name": name, "org_type": "school"}
            city = (row.get("縣市名稱") or row.get("city") or "").strip()
            if city:
                data["city"] = city
            website = (row.get("網址") or row.get("website") or "").strip()
            if website:
                data["website"] = website
            records.append(Record(slug=_slugify(name), data=data, raw=raw, free_text_fields=[]))
        return records
```

- [ ] **Step 6：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_moe_schools.py -q`
Expected: PASS

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 來源 adapter 協定 + 政府開放資料學校 adapter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Orchestrator（run，串起 fetch→偵測→parse→scrub→emit→report）

**Files:**
- Create: `pipeline/run.py`
- Test: `tests_py/test_run.py`

**Interfaces:**
- Consumes: `changedetect`、`emit`、`scrub`、`report`、`sources.base`。
- Produces:
  - `run_source(source, manifest_path, ner) -> tuple[list[Candidate], bool]`：對單一來源執行完整流程；回傳候選清單與「是否有變更」。無變更 → 空候選。
  - `main(argv)` CLI：`python -m pipeline.run --source moe_schools`，寫候選 YAML、更新 manifest、輸出 PR body 到 `pipeline/state/pr-body.md`。
  - 為離線可測，`run_source` 接受注入的 `source`（含 fetch/parse）與 `ner`。

- [ ] **Step 1：寫失敗測試 `tests_py/test_run.py`**

```python
import json
from pipeline.run import run_source
from pipeline.sources.base import Record


class FakeSource:
    name = "fake"

    def __init__(self, out_dir, raw, records):
        self.out_dir = out_dir
        self._raw = raw
        self._records = records

    def fetch(self):
        return self._raw

    def parse(self, raw):
        return self._records


def no_person_ner(text):
    return []


def person_ner(text):
    return ["王小明"] if "王小明" in text else []


def test_run_emits_candidates_and_detects_change(tmp_path):
    recs = [Record(slug="a", data={"name": "校 A", "org_type": "school"}, raw=b"v1", free_text_fields=[])]
    src = FakeSource(str(tmp_path / "out"), b"v1", recs)
    mpath = str(tmp_path / "manifest.json")
    cands, changed = run_source(src, mpath, no_person_ner)
    assert changed is True
    assert len(cands) == 1
    assert cands[0].scrub.has_person is False
    # 再跑一次同資料 → 無變更
    cands2, changed2 = run_source(src, mpath, no_person_ner)
    assert changed2 is False
    assert cands2 == []


def test_run_flags_person(tmp_path):
    recs = [Record(slug="e", data={"title": "戰報", "description": "王小明奪冠"},
                   raw=b"vx", free_text_fields=["title", "description"])]
    src = FakeSource(str(tmp_path / "out"), b"vx", recs)
    cands, changed = run_source(src, str(tmp_path / "m.json"), person_ner)
    assert changed is True
    assert cands[0].scrub.has_person is True
    assert "王小明" in cands[0].scrub.persons
```

- [ ] **Step 2：跑測試確認失敗**

Run: `python3 -m pytest tests_py/test_run.py -q`
Expected: FAIL

- [ ] **Step 3：建立 `pipeline/run.py`**

```python
"""Orchestrator：抓取 → 變更偵測 → parse → CKIP scrub → 產出候選 → PR body。

pipeline 只到「產出候選 + PR body」，不 merge、不上站。發佈永遠由人工在 PR 完成。
"""
from __future__ import annotations
import argparse
import sys

from pipeline.changedetect import Manifest, content_hash
from pipeline.emit import write_candidate
from pipeline.report import Candidate, build_pr_body
from pipeline.scrub import NER, scrub_record

DEFAULT_MANIFEST = "pipeline/state/manifest.json"
PR_BODY_PATH = "pipeline/state/pr-body.md"


def run_source(source, manifest_path: str, ner: NER) -> tuple[list[Candidate], bool]:
    """對單一來源跑完整流程。回傳（候選清單, 是否有變更）。

    無變更（hash 相同）→ 回傳空候選，不做事。
    """
    raw = source.fetch()
    key = source.name
    h = content_hash(raw)
    manifest = Manifest.load(manifest_path)
    if not manifest.is_changed(key, h):
        return [], False

    candidates: list[Candidate] = []
    for rec in source.parse(raw):
        path = write_candidate(rec.data, source.out_dir, rec.slug)
        scrub = scrub_record(rec.data, rec.free_text_fields, ner)
        candidates.append(Candidate(slug=rec.slug, path=path, changed=True, scrub=scrub))

    manifest.set(key, h)
    manifest.save(manifest_path)
    return candidates, True


_SOURCES = {}


def _load_source(name: str):
    if name == "moe_schools":
        from pipeline.sources.moe_schools import MoeSchools
        return MoeSchools()
    raise SystemExit(f"未知來源：{name}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="twdro 資料 pipeline")
    parser.add_argument("--source", required=True, help="來源名稱，如 moe_schools")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    args = parser.parse_args(argv)

    source = _load_source(args.source)
    from pipeline.scrub import ckip_ner
    candidates, changed = run_source(source, args.manifest, ckip_ner())

    if not changed:
        print(f"[{args.source}] 無變更，結束。")
        return 0

    body = build_pr_body(args.source, candidates)
    import os
    os.makedirs(os.path.dirname(PR_BODY_PATH), exist_ok=True)
    with open(PR_BODY_PATH, "w", encoding="utf-8") as f:
        f.write(body)
    flagged = sum(1 for c in candidates if c.scrub.has_person)
    print(f"[{args.source}] 候選 {len(candidates)} 筆，人名警示 {flagged} 筆。PR body → {PR_BODY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4：跑測試確認通過**

Run: `python3 -m pytest tests_py/test_run.py -q`
Expected: PASS

- [ ] **Step 5：跑全部 pytest 確認無回歸**

Run: `python3 -m pytest -q`
Expected: 全部 PASS。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: pipeline orchestrator（fetch→偵測→scrub→候選→PR body）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: GitHub Actions workflows + CI requirements

**Files:**
- Create: `pipeline/requirements.txt`
- Create: `.github/workflows/pipeline-gov.yml`
- Create: `.github/workflows/pipeline-events.yml`
- Create: `.github/workflows/pipeline-intl.yml`

**Interfaces:**
- Produces：三個排程 workflow。每個：setup-python 3.11 → 快取 pip + CKIP 模型 → 安裝 requirements → 跑 `python -m pipeline.run --source <name>` → 若有候選，用 peter-evans/create-pull-request 開 PR（labels `data-pipeline`、`needs-review`），PR body 取自 `pipeline/state/pr-body.md`。

- [ ] **Step 1：建立 `pipeline/requirements.txt`（CI 用）**

```text
PyYAML>=6
requests>=2.31
ckip-transformers>=0.3
torch>=2.2
```

- [ ] **Step 2：建立 `.github/workflows/pipeline-gov.yml`**

```yaml
name: Pipeline · 政府開放資料
on:
  schedule:
    - cron: '0 20 * * *'   # 每日 04:00 台北時間
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
      - name: 快取 CKIP 模型
        uses: actions/cache@v4
        with:
          path: ~/.cache/huggingface
          key: ckip-model-v1
      - run: pip install -r pipeline/requirements.txt
      - name: 執行 pipeline
        run: python -m pipeline.run --source moe_schools
      - name: 開 PR（若有候選變更）
        uses: peter-evans/create-pull-request@v6
        with:
          branch: pipeline/moe-schools
          title: '資料 pipeline：政府開放資料學校候選'
          body-path: pipeline/state/pr-body.md
          labels: |
            data-pipeline
            needs-review
          add-paths: |
            src/content/**
            pipeline/state/manifest.json
```

- [ ] **Step 3：建立 `.github/workflows/pipeline-events.yml`**

```yaml
name: Pipeline · 賽事公告
on:
  schedule:
    - cron: '30 20 * * *'   # 每日 04:30 台北時間
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
      - name: 快取 CKIP 模型
        uses: actions/cache@v4
        with:
          path: ~/.cache/huggingface
          key: ckip-model-v1
      - run: pip install -r pipeline/requirements.txt
      - name: 執行 pipeline（賽事來源尚待接入實際 adapter）
        run: |
          echo "賽事 adapter（教育部/天穹盃公告、簡章 PDF 變更偵測）待補來源實作。"
          echo "框架已就緒：新增 pipeline/sources/<name>.py 後改此步為 python -m pipeline.run --source <name>。"
      - name: 開 PR（若有候選變更）
        if: ${{ hashFiles('pipeline/state/pr-body.md') != '' }}
        uses: peter-evans/create-pull-request@v6
        with:
          branch: pipeline/events
          title: '資料 pipeline：賽事公告候選'
          body-path: pipeline/state/pr-body.md
          labels: |
            data-pipeline
            needs-review
          add-paths: |
            src/content/**
            pipeline/state/manifest.json
```

- [ ] **Step 4：建立 `.github/workflows/pipeline-intl.yml`**

```yaml
name: Pipeline · 國際規則監控
on:
  schedule:
    - cron: '0 21 * * 1'   # 每週一 05:00 台北時間
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
      - run: pip install -r pipeline/requirements.txt
      - name: FAI/FIDA 規則頁變更監控（待補來源實作）
        run: |
          echo "國際 adapter（FAI/FIDA 規則頁 hash 監控）待補來源實作。"
          echo "框架已就緒：新增 pipeline/sources/<name>.py 後改此步為 python -m pipeline.run --source <name>。"
      - name: 開 PR（若有候選變更）
        if: ${{ hashFiles('pipeline/state/pr-body.md') != '' }}
        uses: peter-evans/create-pull-request@v6
        with:
          branch: pipeline/intl
          title: '資料 pipeline：國際規則變更候選'
          body-path: pipeline/state/pr-body.md
          labels: |
            data-pipeline
            needs-review
          add-paths: |
            src/content/**
            pipeline/state/manifest.json
```

- [ ] **Step 5：驗證 workflow YAML 合法**

Run:
```bash
python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/pipeline-*.yml')]; print('workflow YAML OK')"
```
Expected：輸出 `workflow YAML OK`。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: pipeline 三個排程 workflow + CI requirements

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: pipeline README + 全測試驗收

**Files:**
- Create: `pipeline/README.md`
- Modify: `README.md`（加一段指向 pipeline）

**Interfaces:**
- Consumes: 全部前述任務。
- Produces：pipeline 使用說明與整體 pytest 驗收。

- [ ] **Step 1：建立 `pipeline/README.md`**

```md
# twdro 資料 Pipeline

半自動資料取得：GitHub Actions 排程 → 抓取 → 正規化 → CKIP 人名偵測 → 變更偵測 → **開 PR**。
**pipeline 只到開 PR 為止；跨過人工審核閘門才會 merge 上站。**

## 三層個資防護
1. 目標 schema 無選手個資欄位（網站端）。
2. CKIP NER 掃自由文字人名 → PR 標紅、擋自動 merge（只標記不塗改）。
3. 人工在 PR 審核收斂成隊伍層級。

## 本地開發／測試
```bash
python3 -m pip install -r pipeline/requirements-dev.txt   # 不含 torch
python3 -m pytest -q                                      # 離線，scrub 用 mock NER
```

## 正式執行（CI）
`pipeline/requirements.txt` 含 `ckip-transformers` + `torch`（僅 CI 安裝）。
workflow：`pipeline-gov`（每日）、`pipeline-events`（每日）、`pipeline-intl`（每週）。

## 新增來源
在 `pipeline/sources/` 新增實作 `Source` 協定的 adapter（`fetch()`/`parse()`），
於 `pipeline/run.py` 的 `_load_source` 註冊，並在對應 workflow 呼叫。

## 邊界
- 不 rehost 官方 PDF（只存 URL + hash + retrieved_at）。
- 不爬社群/學校公告牆；遵守來源 ToS，不高頻爬取。
- 賽事/國際 adapter 為框架就緒、實際來源待接入（見各 workflow 註記）。
```

- [ ] **Step 2：在專案 `README.md` 末尾加一段**

```md

## 資料 Pipeline
半自動資料取得與個資防護見 [`pipeline/README.md`](pipeline/README.md)。pipeline 產出候選並開 PR，人工審核後才上站。
```

- [ ] **Step 3：全測試驗收**

Run:
```bash
python3 -m pytest -q && npm run test
```
Expected：Python 測試全 PASS、Node 測試維持 32 passing。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "docs: pipeline README 與整體測試驗收

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（對照設計 §4、§5）：**
- pipeline 流水線 fetch→normalize→CKIP→diff→開 PR → Task 1–7 ✅
- 三層個資防護（schema／CKIP／人工閘門）→ Task 3（CKIP）+ report 警示 + 只到 PR ✅
- 變更偵測（content_hash 不覆寫舊版）→ Task 1 ✅
- 三個排程 workflow（gov 每日／events 每日／intl 每週）→ Task 7 ✅
- 不 rehost、不爬社群、遵守 ToS → 註記於 adapter 與 README ✅
- 政府開放資料學校 adapter（真實來源、parse 離線測試）→ Task 5 ✅

**誠實邊界：** CKIP（torch）不在本地測試安裝，scrub 以 mock NER 驗證邏輯、CKIP 後端於 CI 延遲載入；賽事/國際 adapter 為框架就緒、實際來源 URL 待接入（workflow 已註記）。政府學校 adapter 的正式資源 URL 由部署時設定。

**Placeholder 掃描：** 無 TBD；每 code step 含完整程式碼。workflow 中賽事/國際步驟為明示的「待接入來源」佔位，非隱藏空白。

**型別一致性：** `ScrubResult`（Task 3）↔ `Candidate.scrub`（Task 4）↔ `run_source`（Task 6）一致；`Record`（Task 5）↔ orchestrator 讀取的 `.slug/.data/.raw/.free_text_fields` 一致；候選 `data` 欄位（organizations：name/org_type/city/website）↔ 網站 Zod schema 一致。
```
