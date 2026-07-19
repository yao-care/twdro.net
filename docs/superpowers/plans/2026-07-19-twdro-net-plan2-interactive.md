# twdro.net 計畫二：資料庫頁 + 互動工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 在計畫一的靜態站上加上隊伍/場地/器材資料庫頁，以及五個互動工具：球機合規檢查器、規則比較器、賽事日曆篩選、場地地圖、全站搜尋。

**Architecture:** 延續 Astro 5 靜態站。互動以**原生 client `<script>`**（Astro 打包，不引入前端框架）實作，共用 `src/lib/` 的純函式（build 期與 client 期共用、可單元測試）。資料以 `<script type="application/json">` 內嵌傳給 client。地圖用 MapLibre，搜尋用 Pagefind（build 後索引）。

**Tech Stack:** Astro 5、TypeScript、Vitest、MapLibre GL、Pagefind、原生 client script。

## Global Constraints

- 延續計畫一全部約束：Node `>=20.11.0`、Astro `^5`、部署 base `/twdro.net`（`site: https://yao-care.github.io`）。
- 站內連結一律用 `src/lib/url.ts` 的 `url()`；外部連結不包。
- 設計 token：單一全域 `src/styles/tokens.css`（OKLCH + hex fallback、最小 18px、無 dark mode）。第三方庫（MapLibre、Pagefind）自帶的 CSS 允許在其專屬頁面 import，不算違反「我方單一全域 CSS」。
- 資料存 `src/content/` 走 Zod schema；enum 沿用 `src/lib/enums.ts`；`rule_system` FAI/FIDA/MOE/OTHER 各自獨立不混。
- YAML 日期值一律加引號；數字欄位不加引號。
- 個資邊界：`teams` 無選手個資欄位；不新增 `players`。
- 互動元件掛載用 `client` 指示或原生 `<script>`；合規檢查器頁面必附免責：「此工具僅提供初步比對，最終資格以主辦單位與現場檢錄結果為準。」
- commit message 用繁中，結尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: 擴充 rulebook schema 加入結構化賽制規格 + 種子

**Files:**
- Modify: `src/content.config.ts`（rulebooks schema 增 `competition_spec`）
- Modify: `src/content/rulebooks/fai-f9a-b-2026.yml`（補 competition_spec）
- Create: `src/content/rulebooks/moe-taiwan-2026.yml`
- Create: `src/content/rulebooks/fida-2026.yml`

**Interfaces:**
- Consumes: 既有 enums、sourceSchema。
- Produces: 每個 rulebook 可帶 `competition_spec` 物件，供比較器（Task 2）與合規檢查器（Task 3）使用。欄位：`drone_diameter_mm?: number, drone_weight_g_max?: number, motor_type?: string, battery_cells?: string, active_players_min?: number, active_players_max?: number, substitutes?: number, set_duration_sec?: number, sets_to_win?: number, striker_identification?: string, arena_size?: string, goal_size?: string`。

- [ ] **Step 1：修改 `src/content.config.ts` 的 `rulebooks` schema**

在 `rulebooks` 的 `schema: z.object({ ... })` 內，於 `verification` 之前插入：
```ts
    competition_spec: z.object({
      drone_diameter_mm: z.number().optional(),
      drone_weight_g_max: z.number().optional(),
      motor_type: z.string().optional(),
      battery_cells: z.string().optional(),
      active_players_min: z.number().optional(),
      active_players_max: z.number().optional(),
      substitutes: z.number().optional(),
      set_duration_sec: z.number().optional(),
      sets_to_win: z.number().optional(),
      striker_identification: z.string().optional(),
      arena_size: z.string().optional(),
      goal_size: z.string().optional(),
    }).optional(),
```

- [ ] **Step 2：在 `src/content/rulebooks/fai-f9a-b-2026.yml` 補 competition_spec**

在該檔 `verification:` 行之前插入（數字不加引號）：
```yaml
competition_spec:
  drone_diameter_mm: 200
  drone_weight_g_max: 500
  motor_type: brushless
  battery_cells: 3S
  active_players_min: 3
  active_players_max: 5
  substitutes: 2
  set_duration_sec: 180
  sets_to_win: 2
  striker_identification: LED
  arena_size: 8x5m
  goal_size: 60cm
```

- [ ] **Step 3：建立 `src/content/rulebooks/moe-taiwan-2026.yml`**

```yaml
name: 教育部 115 年全國無人機足球競賽規則
organization: 教育部
rule_system: MOE
version: '115'
language: zh-Hant
published_at: "2026-05-25"
official_translation: true
competition_spec:
  drone_diameter_mm: 200
  drone_weight_g_max: 500
  motor_type: brushless
  battery_cells: 3S
  active_players_min: 3
  active_players_max: 3
  substitutes: 2
  set_duration_sec: 180
  sets_to_win: 2
  striker_identification: LED
  arena_size: 8x5m
  goal_size: 60cm
verification: official
sources:
  - type: moe_announcement
    url: https://www.edu.tw/
    published_at: "2026-05-25"
    retrieved_at: "2026-07-19"
    trust_level: A
```

- [ ] **Step 4：建立 `src/content/rulebooks/fida-2026.yml`**

```yaml
name: FIDA Drone Soccer 2026
organization: FIDA
rule_system: FIDA
version: '2026'
language: en
official_translation: false
competition_spec:
  drone_diameter_mm: 200
  drone_weight_g_max: 500
  motor_type: brushless
  battery_cells: 4S
  active_players_min: 5
  active_players_max: 5
  substitutes: 3
  set_duration_sec: 180
  sets_to_win: 2
  striker_identification: 前鋒環
  arena_size: 10x6m
  goal_size: 60cm
verification: source_confirmed
sources:
  - type: fida_official
    url: https://www.fida.sport/
    retrieved_at: "2026-07-19"
    trust_level: A
```

- [ ] **Step 5：驗證 build**

Run: `npx astro sync && npm run build`
Expected：build 成功，`dist/rules/index.html` 現有 FAI/FIDA/MOE 三系統。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: rulebook 加入結構化賽制規格與 MOE/FIDA 種子

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 規則比較器（純函式 + 島）

**Files:**
- Create: `src/lib/compare.ts`
- Test: `tests/compare.test.ts`
- Create: `src/pages/rules/compare.astro`

**Interfaces:**
- Consumes: `rulebooks` collection 的 `competition_spec`、`url()`、`BaseLayout`。
- Produces:
  - `SPEC_FIELDS: {key: string; label: string}[]`（比較欄位順序與中文標籤）
  - `compareRulebooks(books: {id:string; name:string; spec: Record<string,any>}[]): {key:string; label:string; values: (string|number|undefined)[]}[]`
  - 頁面 `/rules/compare`，勾選多個 rulebook 即時比較（原生 script）。

- [ ] **Step 1：寫失敗測試 `tests/compare.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { compareRulebooks, SPEC_FIELDS } from '../src/lib/compare';

describe('compareRulebooks', () => {
  const books = [
    { id: 'fai', name: 'FAI', spec: { drone_diameter_mm: 200, active_players_max: 5 } },
    { id: 'moe', name: 'MOE', spec: { drone_diameter_mm: 200, active_players_max: 3 } },
  ];
  it('每個欄位輸出兩本規則的值', () => {
    const rows = compareRulebooks(books);
    const diameter = rows.find((r) => r.key === 'drone_diameter_mm');
    expect(diameter?.values).toEqual([200, 200]);
    const players = rows.find((r) => r.key === 'active_players_max');
    expect(players?.values).toEqual([5, 3]);
  });
  it('缺值以 undefined 呈現', () => {
    const rows = compareRulebooks([{ id: 'x', name: 'X', spec: {} }]);
    const diameter = rows.find((r) => r.key === 'drone_diameter_mm');
    expect(diameter?.values).toEqual([undefined]);
  });
  it('欄位順序與標籤來自 SPEC_FIELDS', () => {
    const rows = compareRulebooks(books);
    expect(rows.map((r) => r.key)).toEqual(SPEC_FIELDS.map((f) => f.key));
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run test -- tests/compare.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3：建立 `src/lib/compare.ts`**

```ts
export const SPEC_FIELDS: { key: string; label: string }[] = [
  { key: 'drone_diameter_mm', label: '球機直徑(mm)' },
  { key: 'drone_weight_g_max', label: '球機重量上限(g)' },
  { key: 'motor_type', label: '馬達類型' },
  { key: 'battery_cells', label: '電池' },
  { key: 'active_players_min', label: '場上人數(下限)' },
  { key: 'active_players_max', label: '場上人數(上限)' },
  { key: 'substitutes', label: '替補人數' },
  { key: 'set_duration_sec', label: '每局秒數' },
  { key: 'sets_to_win', label: '勝局數' },
  { key: 'striker_identification', label: '前鋒識別' },
  { key: 'arena_size', label: '場地尺寸' },
  { key: 'goal_size', label: '球門尺寸' },
];

export interface CompareBook { id: string; name: string; spec: Record<string, any>; }

export function compareRulebooks(books: CompareBook[]) {
  return SPEC_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    values: books.map((b) => (b.spec ? b.spec[f.key] : undefined)),
  }));
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm run test -- tests/compare.test.ts`
Expected: PASS

- [ ] **Step 5：建立 `src/pages/rules/compare.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { SPEC_FIELDS } from '../../lib/compare';
const books = (await getCollection('rulebooks')).map((b) => ({
  id: b.id, name: b.data.name, spec: b.data.competition_spec ?? {},
}));
const dataJson = JSON.stringify({ books, fields: SPEC_FIELDS });
---
<BaseLayout title="規則比較器 | twdro.net" description="並排比較 FAI、FIDA、教育部等不同無人機足球規則的賽制規格。">
  <h1>規則比較器</h1>
  <p class="text-muted fs-sm">勾選要比較的規則版本。不同體系規則各自獨立，請勿視為可互換。</p>
  <fieldset id="book-picker" style="border:1px solid var(--border-subtle);border-radius:.5em;padding:1rem;margin:1rem 0">
    {books.map((b) => (
      <label style="display:inline-block;margin:.3rem 1rem .3rem 0">
        <input type="checkbox" value={b.id} checked /> {b.name}
      </label>
    ))}
  </fieldset>
  <div id="compare-result" style="overflow-x:auto"></div>
  <script type="application/json" id="compare-data" set:html={dataJson} />
  <script>
    import { compareRulebooks } from '../../lib/compare';
    const raw = document.getElementById('compare-data')!.textContent!;
    const { books } = JSON.parse(raw) as { books: { id: string; name: string; spec: Record<string, any> }[] };
    const picker = document.getElementById('book-picker')!;
    const result = document.getElementById('compare-result')!;
    function render() {
      const checked = Array.from(picker.querySelectorAll('input:checked')).map((i) => (i as HTMLInputElement).value);
      const selected = books.filter((b) => checked.includes(b.id));
      if (selected.length === 0) { result.innerHTML = '<p class="text-muted">請至少勾選一個規則版本。</p>'; return; }
      const rows = compareRulebooks(selected);
      const head = ['<th style="text-align:left;padding:.5rem;border-bottom:2px solid var(--border-subtle)">欄位</th>']
        .concat(selected.map((b) => `<th style="text-align:left;padding:.5rem;border-bottom:2px solid var(--border-subtle)">${b.name}</th>`)).join('');
      const body = rows.map((r) => {
        const cells = r.values.map((v) => `<td style="padding:.5rem;border-bottom:1px solid var(--border-subtle)">${v ?? '—'}</td>`).join('');
        return `<tr><th style="text-align:left;padding:.5rem;border-bottom:1px solid var(--border-subtle)">${r.label}</th>${cells}</tr>`;
      }).join('');
      result.innerHTML = `<table style="border-collapse:collapse;min-width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    picker.addEventListener('change', render);
    render();
  </script>
</BaseLayout>
```

- [ ] **Step 6：build 驗證**

Run: `npm run build && grep -rq "規則比較器" dist/rules/compare/ && echo OK`
Expected：輸出 `OK`。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 規則比較器（純函式 + 前端島）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 球機合規檢查器（純函式 + 島）

**Files:**
- Create: `src/lib/compliance.ts`
- Test: `tests/compliance.test.ts`
- Create: `src/pages/equipment/compliance-check.astro`

**Interfaces:**
- Consumes: `rulebooks` collection 的 `competition_spec`、`BaseLayout`。
- Produces:
  - `checkCompliance(input, spec): { overall: 'compliant'|'partial'|'non_compliant'|'unknown'; fields: {key:string; label:string; input:any; limit:any; status:'pass'|'fail'|'unknown'}[] }`
  - `input` 型別：`{ diameter_mm?: number; weight_g?: number; motor_type?: string; battery_cells?: string }`
  - 頁面 `/equipment/compliance-check`，輸入球機規格 + 選規則 → 逐欄位判定（原生 script），必附免責。

- [ ] **Step 1：寫失敗測試 `tests/compliance.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { checkCompliance } from '../src/lib/compliance';

const spec = { drone_diameter_mm: 200, drone_weight_g_max: 500, motor_type: 'brushless' };

describe('checkCompliance', () => {
  it('全部符合 → compliant', () => {
    const r = checkCompliance({ diameter_mm: 200, weight_g: 480, motor_type: 'brushless' }, spec);
    expect(r.overall).toBe('compliant');
    expect(r.fields.every((f) => f.status === 'pass')).toBe(true);
  });
  it('超重 → 該欄 fail，總體 non_compliant', () => {
    const r = checkCompliance({ diameter_mm: 200, weight_g: 520, motor_type: 'brushless' }, spec);
    const w = r.fields.find((f) => f.key === 'weight_g');
    expect(w?.status).toBe('fail');
    expect(r.overall).toBe('non_compliant');
  });
  it('缺輸入 → 該欄 unknown，總體 partial', () => {
    const r = checkCompliance({ diameter_mm: 200 }, spec);
    expect(r.overall).toBe('partial');
    expect(r.fields.some((f) => f.status === 'unknown')).toBe(true);
  });
  it('直徑必須等於規格', () => {
    const r = checkCompliance({ diameter_mm: 250 }, spec);
    const d = r.fields.find((f) => f.key === 'diameter_mm');
    expect(d?.status).toBe('fail');
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run test -- tests/compliance.test.ts`
Expected: FAIL

- [ ] **Step 3：建立 `src/lib/compliance.ts`**

```ts
export interface ComplianceInput {
  diameter_mm?: number;
  weight_g?: number;
  motor_type?: string;
  battery_cells?: string;
}
type Status = 'pass' | 'fail' | 'unknown';

export function checkCompliance(input: ComplianceInput, spec: Record<string, any>) {
  const fields: { key: string; label: string; input: any; limit: any; status: Status }[] = [];

  const push = (key: string, label: string, inVal: any, limit: any, ok: (i: any, l: any) => boolean) => {
    const noInput = inVal === undefined || inVal === null || inVal === '';
    const noLimit = limit === undefined || limit === null;
    // 該規則未定義此欄、使用者也沒填 → 無可比對，直接略過（不計為 unknown）
    if (noInput && noLimit) return;
    let status: Status;
    if (noInput) status = 'unknown';
    else if (noLimit) status = 'unknown';
    else status = ok(inVal, limit) ? 'pass' : 'fail';
    fields.push({ key, label, input: inVal ?? '', limit: limit ?? '', status });
  };

  push('diameter_mm', '球機直徑(mm)', input.diameter_mm, spec.drone_diameter_mm, (i, l) => Number(i) === Number(l));
  push('weight_g', '球機重量(g)', input.weight_g, spec.drone_weight_g_max, (i, l) => Number(i) <= Number(l));
  push('motor_type', '馬達類型', input.motor_type, spec.motor_type, (i, l) => String(i).toLowerCase() === String(l).toLowerCase());
  push('battery_cells', '電池', input.battery_cells, spec.battery_cells, (i, l) => String(i).toLowerCase() === String(l).toLowerCase());

  const anyFail = fields.some((f) => f.status === 'fail');
  const anyUnknown = fields.some((f) => f.status === 'unknown');
  const overall = anyFail ? 'non_compliant' : anyUnknown ? 'partial' : 'compliant';
  return { overall, fields };
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm run test -- tests/compliance.test.ts`
Expected: PASS

- [ ] **Step 5：建立 `src/pages/equipment/compliance-check.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
const books = (await getCollection('rulebooks')).map((b) => ({
  id: b.id, name: b.data.name, spec: b.data.competition_spec ?? {},
}));
const dataJson = JSON.stringify({ books });
---
<BaseLayout title="球機合規檢查器 | twdro.net" description="輸入球機規格，初步比對是否符合指定賽事規則。">
  <h1>球機合規檢查器</h1>
  <p class="text-muted fs-sm">選擇賽事規則並填入球機規格，系統做初步比對。</p>
  <form id="cc-form" style="display:grid;gap:.8rem;max-width:36rem">
    <label>賽事規則
      <select id="cc-rule" style="display:block;font-size:var(--text-base);padding:.3rem">
        {books.map((b) => <option value={b.id}>{b.name}</option>)}
      </select>
    </label>
    <label>球機直徑 (mm) <input id="cc-diameter" type="number" inputmode="numeric" style="display:block;font-size:var(--text-base);padding:.3rem" /></label>
    <label>球機總重 (g) <input id="cc-weight" type="number" inputmode="numeric" style="display:block;font-size:var(--text-base);padding:.3rem" /></label>
    <label>馬達類型 <input id="cc-motor" type="text" placeholder="brushless / brushed" style="display:block;font-size:var(--text-base);padding:.3rem" /></label>
    <label>電池 <input id="cc-battery" type="text" placeholder="例如 3S" style="display:block;font-size:var(--text-base);padding:.3rem" /></label>
    <button type="submit" style="font-size:var(--text-base);padding:.5rem 1rem;width:fit-content">檢查</button>
  </form>
  <div id="cc-result" style="margin-top:1.5rem"></div>
  <p class="fs-xs text-muted" style="margin-top:1.5rem;border-top:1px solid var(--border-subtle);padding-top:1rem">
    此工具僅提供初步比對，最終資格以主辦單位與現場檢錄結果為準。
  </p>
  <script type="application/json" id="cc-data" set:html={dataJson} />
  <script>
    import { checkCompliance } from '../../lib/compliance';
    const { books } = JSON.parse(document.getElementById('cc-data')!.textContent!) as { books: { id: string; name: string; spec: Record<string, any> }[] };
    const form = document.getElementById('cc-form') as HTMLFormElement;
    const result = document.getElementById('cc-result')!;
    const num = (id: string) => { const v = (document.getElementById(id) as HTMLInputElement).value; return v === '' ? undefined : Number(v); };
    const str = (id: string) => { const v = (document.getElementById(id) as HTMLInputElement).value.trim(); return v === '' ? undefined : v; };
    const LABEL: Record<string, string> = { compliant: '初步符合', partial: '部分欄位待確認', non_compliant: '不符合', unknown: '無法判定' };
    const COLOR: Record<string, string> = { pass: 'var(--color-pass)', fail: 'var(--color-critical)', unknown: 'var(--text-muted)' };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ruleId = (document.getElementById('cc-rule') as HTMLSelectElement).value;
      const spec = books.find((b) => b.id === ruleId)?.spec ?? {};
      const r = checkCompliance({ diameter_mm: num('cc-diameter'), weight_g: num('cc-weight'), motor_type: str('cc-motor'), battery_cells: str('cc-battery') }, spec);
      const rows = r.fields.map((f) => `<tr><th style="text-align:left;padding:.4rem">${f.label}</th><td style="padding:.4rem">${f.input || '—'}</td><td style="padding:.4rem">規格 ${f.limit || '—'}</td><td style="padding:.4rem;color:${COLOR[f.status]};font-weight:600">${f.status === 'pass' ? '符合' : f.status === 'fail' ? '不符' : '待確認'}</td></tr>`).join('');
      result.innerHTML = `<p class="fs-lg" style="font-weight:700">${LABEL[r.overall]}</p><table style="border-collapse:collapse"><tbody>${rows}</tbody></table>`;
    });
  </script>
</BaseLayout>
```

- [ ] **Step 6：build 驗證**

Run: `npm run build && grep -rq "球機合規檢查器" dist/equipment/compliance-check/ && grep -rq "最終資格以主辦單位" dist/equipment/compliance-check/ && echo OK`
Expected：輸出 `OK`。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 球機合規檢查器（純函式 + 前端島 + 免責）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 隊伍頁 + 導覽加入 /teams

**Files:**
- Create: `src/content/teams/example-junior-high.yml`
- Create: `src/content/teams/example-university.yml`
- Create: `src/pages/teams/index.astro`
- Create: `src/pages/teams/[slug].astro`
- Modify: `src/components/SiteHeader.astro`（nav 加 `/teams` 隊伍）

**Interfaces:**
- Consumes: `teams` collection、`verificationLabel`、`url()`、`BaseLayout`。
- Produces: `/teams`（依 team_type 分組），`/teams/<slug>`（隊伍介紹、所屬、招募、驗證狀態）。**不顯示任何選手個資**。

- [ ] **Step 1：建立種子 `src/content/teams/example-junior-high.yml`**

```yaml
name: 示範國中無人機足球隊
english_name: Demo Junior High Drone Soccer
team_type: junior_high_school
city: 臺北市
district: 中正區
introduction: 本隊為示範資料，用於展示隊伍頁結構。
recruitment_status: 招募中
verification: community_submitted
```

- [ ] **Step 2：建立種子 `src/content/teams/example-university.yml`**

```yaml
name: 示範大學無人機足球隊
english_name: Demo University Drone Soccer
team_type: university
city: 新竹市
introduction: 本隊為示範資料。
recruitment_status: 額滿
verification: community_submitted
```

- [ ] **Step 3：建立列表頁 `src/pages/teams/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
const teams = await getCollection('teams');
const GROUPS: [string, string][] = [
  ['elementary_school', '國小'], ['junior_high_school', '國中'], ['senior_high_school', '高中'],
  ['college', '專科'], ['university', '大專校院'], ['club', '俱樂部'],
  ['company', '企業'], ['community', '社區'], ['national_team', '代表隊'], ['temporary_team', '臨時隊伍'],
];
---
<BaseLayout title="隊伍 | twdro.net" description="全台無人機足球隊伍名錄（學校、俱樂部）。">
  <h1>隊伍</h1>
  {GROUPS.map(([key, label]) => {
    const list = teams.filter((t) => t.data.team_type === key);
    return list.length ? (
      <section>
        <h2>{label}</h2>
        <ul>{list.map((t) => (
          <li style="margin:.4rem 0"><a href={url(`/teams/${t.id}`)} class="fs-lg">{t.data.name}</a>
            {t.data.recruitment_status && <span class="fs-xs text-muted">（{t.data.recruitment_status}）</span>}</li>
        ))}</ul>
      </section>
    ) : null;
  })}
</BaseLayout>
```

- [ ] **Step 4：建立詳細頁 `src/pages/teams/[slug].astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { verificationLabel } from '../../lib/enums';
export async function getStaticPaths() {
  const teams = await getCollection('teams');
  return teams.map((t) => ({ params: { slug: t.id }, props: { team: t } }));
}
const { team } = Astro.props;
const d = team.data;
---
<BaseLayout title={`${d.name} | twdro.net`} description={d.introduction}>
  <article>
    <h1>{d.name}</h1>
    {d.english_name && <p class="fs-sm text-muted">{d.english_name}</p>}
    <ul>
      <li>類型：{d.team_type}</li>
      <li>所在地：{d.city ?? ''} {d.district ?? ''}</li>
      {d.recruitment_status && <li>招募狀態：{d.recruitment_status}</li>}
      <li>資料狀態：{verificationLabel(d.verification)}</li>
    </ul>
    {d.introduction && <p>{d.introduction}</p>}
    <p class="fs-xs text-muted">本頁僅呈現隊伍層級公開資訊，不含選手個人資料。</p>
  </article>
</BaseLayout>
```

- [ ] **Step 5：修改 `src/components/SiteHeader.astro` nav 加入 /teams**

本步只加入 `/teams`（`/equipment` 於 Task 6 建立頁面時再加，避免死連結）。將 `nav` 陣列改為：
```astro
const nav = [
  ['/events', '賽事'], ['/rules', '規則'], ['/teams', '隊伍'],
  ['/learn', '認識無人機足球'], ['/about', '關於'],
];
```

- [ ] **Step 6：build 驗證**

Run: `npm run build && grep -rq "示範國中無人機足球隊" dist/teams/ && echo OK`
Expected：輸出 `OK`。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 隊伍列表與詳細頁（隊伍層級，無個資）+ 導覽加入隊伍

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 場地頁 + 地圖（MapLibre）

**Files:**
- Modify: `package.json`（加 `maplibre-gl` 相依）
- Create: `src/content/venues/example-arena.yml`
- Create: `src/content/venues/example-school-gym.yml`
- Create: `src/pages/venues/index.astro`
- Create: `src/pages/venues/[slug].astro`

**Interfaces:**
- Consumes: `venues` collection、`verificationLabel`、`url()`、`BaseLayout`、`maplibre-gl`。
- Produces: `/venues`（清單 + MapLibre 地圖，含有經緯度者），`/venues/<slug>`（場地詳情）。

- [ ] **Step 1：加入 maplibre 相依**

Run:
```bash
npm install maplibre-gl@^4
```
（若 npm cache 受限，加 `--cache <可寫路徑>`。）

- [ ] **Step 2：建立種子 `src/content/venues/example-arena.yml`**

```yaml
name: 示範無人機足球競賽場館
venue_type: 正式比賽場館
address: 臺北市中正區示範路 1 號
city: 臺北市
district: 中正區
latitude: 25.0330
longitude: 121.5654
indoor: true
booking_method: 電話預約
verification: community_submitted
```

- [ ] **Step 3：建立種子 `src/content/venues/example-school-gym.yml`**

```yaml
name: 示範學校體育館
venue_type: 學校體育館
address: 新竹市示範街 2 號
city: 新竹市
latitude: 24.8138
longitude: 120.9675
indoor: true
booking_method: 洽學校體育組
verification: community_submitted
```

- [ ] **Step 4：建立列表頁 `src/pages/venues/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
const venues = await getCollection('venues');
const points = venues
  .filter((v) => typeof v.data.latitude === 'number' && typeof v.data.longitude === 'number')
  .map((v) => ({ id: v.id, name: v.data.name, lat: v.data.latitude, lng: v.data.longitude }));
const pointsJson = JSON.stringify(points);
---
<BaseLayout title="場地 | twdro.net" description="無人機足球練習與比賽場地地圖。">
  <h1>場地與活動</h1>
  <div id="map" style="height:420px;border:1px solid var(--border-subtle);border-radius:.5em;margin:1rem 0"></div>
  <ul>
    {venues.map((v) => (
      <li style="margin:.4rem 0"><a href={url(`/venues/${v.id}`)} class="fs-lg">{v.data.name}</a>
        <span class="fs-xs text-muted">（{v.data.venue_type}｜{v.data.city ?? ''}）</span></li>
    ))}
  </ul>
  <script type="application/json" id="venue-points" set:html={pointsJson} />
  <script>
    import maplibregl from 'maplibre-gl';
    import 'maplibre-gl/dist/maplibre-gl.css';
    const points = JSON.parse(document.getElementById('venue-points')!.textContent!) as { id: string; name: string; lat: number; lng: number }[];
    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [121.0, 24.5],
      zoom: 6.5,
    });
    map.addControl(new maplibregl.NavigationControl());
    for (const p of points) {
      new maplibregl.Marker().setLngLat([p.lng, p.lat]).setPopup(new maplibregl.Popup().setText(p.name)).addTo(map);
    }
  </script>
</BaseLayout>
```

- [ ] **Step 5：建立詳細頁 `src/pages/venues/[slug].astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { verificationLabel } from '../../lib/enums';
export async function getStaticPaths() {
  const venues = await getCollection('venues');
  return venues.map((v) => ({ params: { slug: v.id }, props: { venue: v } }));
}
const { venue } = Astro.props;
const d = venue.data;
---
<BaseLayout title={`${d.name} | twdro.net`}>
  <article>
    <h1>{d.name}</h1>
    <ul>
      <li>類型：{d.venue_type}</li>
      <li>地址：{d.address ?? '—'}</li>
      <li>室內：{d.indoor ? '是' : '否'}</li>
      {d.booking_method && <li>預約方式：{d.booking_method}</li>}
      <li>資料狀態：{verificationLabel(d.verification)}</li>
    </ul>
  </article>
</BaseLayout>
```

- [ ] **Step 6：build 驗證**

Run: `npm run build && grep -rq "示範無人機足球競賽場館" dist/venues/ && echo OK`
Expected：輸出 `OK`。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 場地列表（含 MapLibre 地圖）與詳細頁

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 器材頁 + 導覽加入 /equipment + 連到合規檢查器

**Files:**
- Create: `src/content/equipment/example-drone-ball.yml`
- Create: `src/pages/equipment/index.astro`
- Create: `src/pages/equipment/[slug].astro`
- Modify: `src/components/SiteHeader.astro`（nav 加 `/equipment` 器材）

**Interfaces:**
- Consumes: `equipment` collection、`url()`、`BaseLayout`。
- Produces: `/equipment`（球機清單 + 連到合規檢查器），`/equipment/<slug>`（規格）。詳細頁的 `[slug]` 不可攔截 `/equipment/compliance-check`（那是 Task 3 的靜態頁，Astro 靜態頁優先於動態路由，故安全；但種子 slug 不得取名 `compliance-check`）。

- [ ] **Step 1：建立種子 `src/content/equipment/example-drone-ball.yml`**

```yaml
brand: 示範品牌
model: DS-200
diameter_mm: 200
weight_g: 480
motor_type: brushless
battery_voltage: 11.1V
list_price: NT$4500
sources:
  - type: vendor_listing
    url: https://example.com/ds-200
    retrieved_at: "2026-07-19"
    trust_level: C
```

- [ ] **Step 2：建立列表頁 `src/pages/equipment/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
const items = await getCollection('equipment');
---
<BaseLayout title="器材 | twdro.net" description="無人機足球球機資料庫與合規檢查。">
  <h1>器材</h1>
  <p><a href={url('/equipment/compliance-check')} class="fs-lg">→ 球機合規檢查器</a></p>
  <h2>球機資料庫</h2>
  <ul>
    {items.map((it) => (
      <li style="margin:.4rem 0"><a href={url(`/equipment/${it.id}`)} class="fs-lg">{it.data.brand} {it.data.model}</a>
        <span class="fs-xs text-muted">（直徑 {it.data.diameter_mm ?? '—'}mm｜{it.data.weight_g ?? '—'}g）</span></li>
    ))}
  </ul>
</BaseLayout>
```

- [ ] **Step 3：建立詳細頁 `src/pages/equipment/[slug].astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import SourceBlock from '../../components/SourceBlock.astro';
export async function getStaticPaths() {
  const items = await getCollection('equipment');
  return items.map((it) => ({ params: { slug: it.id }, props: { item: it } }));
}
const { item } = Astro.props;
const d = item.data;
---
<BaseLayout title={`${d.brand} ${d.model} | twdro.net`}>
  <article>
    <h1>{d.brand} {d.model}</h1>
    <ul>
      <li>直徑：{d.diameter_mm ?? '—'} mm</li>
      <li>重量：{d.weight_g ?? '—'} g</li>
      <li>馬達：{d.motor_type ?? '—'}</li>
      <li>電池：{d.battery_voltage ?? '—'}</li>
      <li>參考售價：{d.list_price ?? '—'}</li>
    </ul>
    {d.sources && d.sources.length > 0 && <SourceBlock sources={d.sources} verification="community_submitted" />}
  </article>
</BaseLayout>
```

- [ ] **Step 4：修改 `src/components/SiteHeader.astro` nav 加入 /equipment**

將 `nav` 改為：
```astro
const nav = [
  ['/events', '賽事'], ['/rules', '規則'], ['/teams', '隊伍'],
  ['/equipment', '器材'], ['/learn', '認識無人機足球'], ['/about', '關於'],
];
```

- [ ] **Step 5：build 驗證（含動態路由不衝突）**

Run: `npm run build && grep -rq "示範品牌" dist/equipment/ && test -f dist/equipment/compliance-check/index.html && echo OK`
Expected：輸出 `OK`（器材種子頁與合規檢查器頁並存）。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: 器材列表與詳細頁 + 導覽加入器材

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 賽事日曆篩選頁

**Files:**
- Create: `src/pages/events/calendar.astro`
- Modify: `src/pages/events/index.astro`（頂部加「日曆檢視」連結）

**Interfaces:**
- Consumes: `events` collection、`StatusBadge` 邏輯（此處用純 script 呈現）、`url()`、`BaseLayout`、`eventStatusLabel`。
- Produces: `/events/calendar`，可依狀態與月份篩選的賽事清單（原生 script）。`/events/calendar` 為靜態頁，不與 `[slug]` 衝突（靜態頁優先）。

- [ ] **Step 1：建立 `src/pages/events/calendar.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
import { EVENT_STATUS, eventStatusLabel } from '../../lib/enums';
const events = (await getCollection('events')).map((e) => ({
  id: e.id, title: e.data.title, status: e.data.status,
  start: e.data.schedule.event_start ?? '', city: e.data.schedule.city ?? '',
}));
const eventsJson = JSON.stringify(events);
const statusOptions = EVENT_STATUS.map((s) => ({ value: s, label: eventStatusLabel(s) }));
---
<BaseLayout title="賽事日曆 | twdro.net" description="依狀態與月份篩選台灣無人機足球賽事。">
  <h1>賽事日曆</h1>
  <p><a href={url('/events')}>← 回賽事列表</a></p>
  <div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
    <label>狀態
      <select id="f-status" style="display:block;font-size:var(--text-base);padding:.3rem">
        <option value="">全部</option>
        {statusOptions.map((o) => <option value={o.value}>{o.label}</option>)}
      </select>
    </label>
    <label>月份 <input id="f-month" type="month" style="display:block;font-size:var(--text-base);padding:.3rem" /></label>
  </div>
  <ul id="cal-list" style="list-style:none;padding:0"></ul>
  <script type="application/json" id="cal-data" set:html={eventsJson} />
  <script>
    import { eventStatusLabel } from '../../lib/enums';
    import { url } from '../../lib/url';
    const events = JSON.parse(document.getElementById('cal-data')!.textContent!) as { id: string; title: string; status: string; start: string; city: string }[];
    const list = document.getElementById('cal-list')!;
    const fStatus = document.getElementById('f-status') as HTMLSelectElement;
    const fMonth = document.getElementById('f-month') as HTMLInputElement;
    function render() {
      const s = fStatus.value, m = fMonth.value;
      const filtered = events.filter((e) => (!s || e.status === s) && (!m || e.start.startsWith(m)))
        .sort((a, b) => a.start.localeCompare(b.start));
      list.innerHTML = filtered.length ? filtered.map((e) =>
        `<li style="padding:.6rem 0;border-bottom:1px solid var(--border-subtle)"><span class="fs-xs text-muted">${e.start || '日期未定'}</span> · ${eventStatusLabel(e.status)} · <a href="${url('/events/' + e.id)}">${e.title}</a> <span class="fs-xs text-muted">${e.city}</span></li>`
      ).join('') : '<li class="text-muted">沒有符合條件的賽事。</li>';
    }
    fStatus.addEventListener('change', render);
    fMonth.addEventListener('input', render);
    render();
  </script>
</BaseLayout>
```

- [ ] **Step 2：在 `src/pages/events/index.astro` 頂部加日曆連結**

在 `<h1>賽事</h1>` 之後插入一行（frontmatter 已 import `url`）：
```astro
  <p><a href={url('/events/calendar')} class="fs-lg">→ 日曆檢視（依狀態/月份篩選）</a></p>
```

- [ ] **Step 3：build 驗證**

Run: `npm run build && grep -rq "賽事日曆" dist/events/calendar/ && echo OK`
Expected：輸出 `OK`。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "feat: 賽事日曆篩選頁

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 全站搜尋（Pagefind）

**Files:**
- Modify: `package.json`（build script 加 pagefind；加 devDependency `pagefind`）
- Modify: `.github/workflows/deploy.yml`（build 後產生 pagefind 索引 —— 因 build script 已含，故確認即可）
- Create: `src/pages/search.astro`
- Modify: `src/components/SiteHeader.astro`（nav 加「搜尋」連結）

**Interfaces:**
- Consumes: `BaseLayout`、`url()`、Pagefind（build 後於 `dist/pagefind/` 產生）。
- Produces: `/search` 頁，載入 Pagefind UI，索引全站內容。build script 改為 `astro build && pagefind --site dist`。

- [ ] **Step 1：加入 pagefind devDependency 並改 build script**

Run:
```bash
npm install -D pagefind@^1
```
然後修改 `package.json` 的 `scripts.build`：
```json
    "build": "astro build && pagefind --site dist",
```

- [ ] **Step 2：建立 `src/pages/search.astro`**

Pagefind UI 資產在 build 後位於 `/twdro.net/pagefind/`。以 client script 動態載入並初始化：
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { url } from '../lib/url';
const bundlePath = url('/pagefind/');
---
<BaseLayout title="搜尋 | twdro.net" description="搜尋全站賽事、規則、隊伍、場地與器材。">
  <h1>搜尋</h1>
  <link href={url('/pagefind/pagefind-ui.css')} rel="stylesheet" slot="head" />
  <div id="search"></div>
  <p class="fs-xs text-muted" style="margin-top:1rem">搜尋索引於部署時產生；本地預覽需先 <code>npm run build</code>。</p>
  <script type="application/json" id="pf-cfg" set:html={JSON.stringify({ bundlePath })} />
  <script>
    const { bundlePath } = JSON.parse(document.getElementById('pf-cfg')!.textContent!) as { bundlePath: string };
    // 動態載入 Pagefind UI（build 後才存在）
    const s = document.createElement('script');
    s.src = bundlePath + 'pagefind-ui.js';
    s.onload = () => {
      // @ts-ignore - PagefindUI 由外部腳本掛到全域
      new (window as any).PagefindUI({ element: '#search', bundlePath, showSubResults: true, translations: { placeholder: '搜尋賽事、規則、隊伍、器材…' } });
    };
    document.head.appendChild(s);
  </script>
</BaseLayout>
```

- [ ] **Step 3：修改 `src/components/SiteHeader.astro` nav 加入搜尋**

將 `nav` 改為（在關於後加搜尋）：
```astro
const nav = [
  ['/events', '賽事'], ['/rules', '規則'], ['/teams', '隊伍'],
  ['/equipment', '器材'], ['/learn', '認識無人機足球'], ['/about', '關於'], ['/search', '搜尋'],
];
```

- [ ] **Step 4：build 驗證（Pagefind 索引產生）**

Run:
```bash
npm run build && test -d dist/pagefind && test -f dist/search/index.html && echo OK
```
Expected：輸出 `OK`（`dist/pagefind/` 存在，搜尋頁存在）。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: 全站搜尋（Pagefind）+ 導覽加入搜尋

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 首頁補入口 + build 驗收

**Files:**
- Modify: `src/pages/index.astro`（加入互動工具與資料庫入口區塊）
- Modify: `tests/build-smoke.test.ts`（新增新頁面斷言）

**Interfaces:**
- Consumes: 全部前述任務。
- Produces: 首頁新增「工具與資料」快速入口；build-smoke 涵蓋新頁。

- [ ] **Step 1：在 `src/pages/index.astro` 近期賽事區塊之後插入入口區塊**

在最後一個 `</section>` 之後、`</BaseLayout>` 之前插入：
```astro
  <section>
    <h2>工具與資料</h2>
    <ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.8rem">
      <li><a href={url('/rules/compare')} class="fs-lg">規則比較器</a></li>
      <li><a href={url('/equipment/compliance-check')} class="fs-lg">球機合規檢查器</a></li>
      <li><a href={url('/events/calendar')} class="fs-lg">賽事日曆</a></li>
      <li><a href={url('/teams')} class="fs-lg">隊伍名錄</a></li>
      <li><a href={url('/venues')} class="fs-lg">場地地圖</a></li>
      <li><a href={url('/search')} class="fs-lg">全站搜尋</a></li>
    </ul>
  </section>
```

- [ ] **Step 2：擴充 `tests/build-smoke.test.ts` 的 `pages` 陣列**

在既有 `pages` 陣列中加入：
```ts
    'dist/teams/index.html',
    'dist/venues/index.html',
    'dist/equipment/index.html',
    'dist/rules/compare/index.html',
    'dist/equipment/compliance-check/index.html',
    'dist/events/calendar/index.html',
    'dist/search/index.html',
```

- [ ] **Step 3：完整 build + 測試**

Run:
```bash
npm run build && npm run test
```
Expected：build 成功、Pagefind 索引產生、全測試 PASS。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "feat: 首頁工具與資料入口 + 擴充 build 驗收

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（對照設計 §6）：**
- 隊伍列表/詳細（隊伍層級無個資）→ Task 4 ✅
- 場地列表/地圖/詳細 → Task 5 ✅
- 器材列表/詳細 + 合規檢查器 → Task 3、6 ✅
- 規則比較器 → Task 2 ✅
- 賽事日曆篩選 → Task 7 ✅
- 全站搜尋 → Task 8 ✅
- 首頁工具入口 → Task 9 ✅

**Placeholder 掃描：** 無 TBD；每 code step 含完整程式碼。種子資料標為「示範」屬合理內容種子。

**型別一致性：** `checkCompliance`/`compareRulebooks` 簽章（Task 2/3 lib）↔ 島 script 呼叫一致；`competition_spec` 欄位（Task 1 schema）↔ compare/compliance 讀取的 key 一致（drone_diameter_mm、drone_weight_g_max、motor_type、battery_cells…）。

**導覽演進：** nav 於 Task 4 加 /teams、Task 6 加 /equipment、Task 8 加 /search，每步對應頁面均已於同一或先前任務建立，無死連結。

**動態路由不衝突：** `/rules/compare`、`/equipment/compliance-check`、`/events/calendar` 皆為具名靜態頁，Astro 靜態頁優先於同層 `[slug]` 動態路由；種子 slug 不得與這些保留名相同（已於 Task 6 註明）。
