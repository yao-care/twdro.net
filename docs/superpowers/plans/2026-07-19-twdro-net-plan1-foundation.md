# twdro.net 計畫一：靜態站地基 + 核心內容頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個能部署到 GitHub Pages（綁 `twdro.net`）、由 repo 內結構化資料驅動的靜態網站，含首頁、賽事、規則、認識無人機足球、關於/法遵頁，並以 Zod schema 驗證資料。

**Architecture:** Astro 5 靜態輸出。所有「事實」為 `src/content/` 內的 YAML/Markdown，經 Astro Content Collections + Zod schema 於 build 時驗證，render 成靜態 HTML。純內容層，**本計畫零 client-side JS**（互動工具在計畫二）。樣式走單一全域 design-tokens CSS。

**Tech Stack:** Astro 5、TypeScript、Zod（Astro 內建）、Vitest（單元測試）、GitHub Actions（部署）、Node 20。

## Global Constraints

- Node：`>=20.11.0`；套件管理用 npm。
- Astro：`^5`（使用 `src/content.config.ts` Content Layer API 與 `glob` loader）。
- 部署：GitHub Pages。**現階段先上專案子路徑**（DNS 未設）：`site` = `https://yao-care.github.io`、`base` = `/twdro.net`，**先不放 CNAME**。所有站內連結一律用 `src/lib/url.ts` 的 `url()` 包裝，勿寫死 `/xxx`。未來 DNS 設好只需把 `base` 改回 `/`、`site` 改為 `https://twdro.net`、新增 `public/CNAME`（內容 `twdro.net`），連結無需改動。
- 樣式：**單一全域 CSS** `src/styles/tokens.css`，於 `BaseLayout` import 一次；不使用 Astro scoped `<style>`。
- 字級：最小 18px（`--text-xs`），無例外。量表：xs 18 / sm 20 / base 24 / lg 28 / xl 32 / 2xl 48 / 3xl 56（px）。行高 1.6。字型堆疊 `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`。
- 配色：OKLCH light theme，CSS 一律 `oklch()` + `@supports not (color: oklch(0 0 0))` hex fallback。無 dark mode。
- URL：`slug = 檔名 = 網址`，永不使用 query id。
- 個資：`team` schema **不得含**任何選手個資欄位；`results` 只到隊伍名次。
- 規則體系：`rule_system` 為 FAI / FIDA / MOE / OTHER，**各自獨立，嚴禁跨體系混用覆寫**。
- 每次任務結尾 commit；commit message 用繁中，結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: Astro 專案骨架與部署

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `public/.nojekyll`
- Create: `.github/workflows/deploy.yml`
- Create: `src/pages/index.astro`（暫時占位，Task 10 取代）

> **注意（DNS 未設，先上專案子路徑）**：本階段**不建立** `public/CNAME`。`astro.config.mjs` 用 `site: 'https://yao-care.github.io'`、`base: '/twdro.net'`。

**Interfaces:**
- Produces: 可 build 的 Astro 專案；`npm run build` 產出 `dist/`；push 到 `main` 觸發部署。

- [ ] **Step 1：建立 `package.json`**

```json
{
  "name": "twdro-net",
  "type": "module",
  "version": "0.1.0",
  "engines": { "node": ">=20.11.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run"
  },
  "dependencies": {
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2：建立 `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

// DNS 未設前先部署到專案子路徑 https://yao-care.github.io/twdro.net/
// 之後綁定 twdro.net 時：site 改 'https://twdro.net'、base 改 '/'、並新增 public/CNAME
export default defineConfig({
  site: 'https://yao-care.github.io',
  base: '/twdro.net',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
```

- [ ] **Step 3：建立 `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4：建立 `public/.nojekyll`**

（**本階段不建立 `public/CNAME`**；DNS 綁定時再新增。）

`public/.nojekyll`（空檔，避免 GitHub Pages 用 Jekyll 處理）：
```text
```

- [ ] **Step 5：建立暫時首頁 `src/pages/index.astro`**

```astro
---
---
<!doctype html>
<html lang="zh-Hant">
  <head><meta charset="utf-8" /><title>twdro.net</title></head>
  <body><h1>twdro.net 建置中</h1></body>
</html>
```

- [ ] **Step 6：建立部署 workflow `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 7：安裝並 build 驗證**

Run:
```bash
npm install && npm run build
```
Expected：build 成功，出現 `dist/index.html`。

- [ ] **Step 8：Commit**

```bash
git add -A
git commit -m "feat: Astro 專案骨架與 GitHub Pages 部署

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: design-tokens 全域 CSS 與 BaseLayout

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/lib/url.ts`
- Create: `src/layouts/BaseLayout.astro`
- Test: `tests/tokens.test.ts`
- Test: `tests/url.test.ts`

**Interfaces:**
- Produces:
  - `BaseLayout`，props `{ title: string; description?: string; lang?: string }`，import `tokens.css` 一次，提供 `<slot />`。所有頁面套此 layout。
  - `url(path: string): string`（`src/lib/url.ts`）——將站內絕對路徑接上 `import.meta.env.BASE_URL`。所有站內連結（Task 6–11）一律用它，不得寫死 `/xxx`。

- [ ] **Step 1：寫失敗測試 `tests/tokens.test.ts`**（驗證 token 值不被誤改）

```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

describe('design tokens', () => {
  it('最小字級為 18px', () => {
    expect(css).toContain('--text-xs: 1.125rem'); // 18px
  });
  it('正文字級 24px', () => {
    expect(css).toContain('--text-base: 1.5rem'); // 24px
  });
  it('背景與正文色用 oklch', () => {
    expect(css).toContain('oklch(0.97 0.005 250)'); // --bg-base
    expect(css).toContain('oklch(0.20 0.01 250)');  // --text-primary
  });
  it('提供 hex fallback', () => {
    expect(css).toContain('@supports not (color: oklch(0 0 0))');
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run test -- tests/tokens.test.ts`
Expected: FAIL（`tokens.css` 不存在）

- [ ] **Step 3：建立 `src/styles/tokens.css`**

```css
:root {
  /* 字級（最小 18px，無例外）*/
  --text-xs: 1.125rem;  /* 18px */
  --text-sm: 1.25rem;   /* 20px */
  --text-base: 1.5rem;  /* 24px */
  --text-lg: 1.75rem;   /* 28px */
  --text-xl: 2rem;      /* 32px */
  --text-2xl: 3rem;     /* 48px */
  --text-3xl: 3.5rem;   /* 56px */

  /* 背景 */
  --bg-base: oklch(0.97 0.005 250);
  --bg-surface: oklch(0.94 0.005 250);
  --bg-overlay: oklch(0.90 0.008 250);
  --bg-hover: oklch(0.92 0.005 250);

  /* 文字 */
  --text-primary: oklch(0.20 0.01 250);
  --text-secondary: oklch(0.45 0.01 250);
  --text-muted: oklch(0.60 0.008 250);

  /* 嚴重度／狀態 */
  --color-critical: oklch(0.55 0.22 25);
  --color-high: oklch(0.55 0.16 55);
  --color-medium: oklch(0.52 0.14 80);
  --color-low: oklch(0.52 0.13 240);
  --color-pass: oklch(0.48 0.16 150);

  /* 功能 */
  --color-link: oklch(0.48 0.15 250);
  --border-subtle: oklch(0.85 0.005 250);

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --line-height: 1.6;
}

@supports not (color: oklch(0 0 0)) {
  :root {
    --bg-base: #f5f6f8;
    --bg-surface: #ecedf0;
    --bg-overlay: #dfe0e5;
    --bg-hover: #e5e6ea;
    --text-primary: #1e2030;
    --text-secondary: #5e6070;
    --text-muted: #8a8c98;
    --color-critical: #c93135;
    --color-high: #b86a2a;
    --color-medium: #8a7020;
    --color-low: #2a6bb8;
    --color-pass: #1e8050;
    --color-link: #1e5ab8;
    --border-subtle: #d5d6da;
  }
}

* { box-sizing: border-box; }

html {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--line-height);
  color: var(--text-primary);
  background: var(--bg-base);
}

body { margin: 0; }

h1 { font-size: var(--text-3xl); font-weight: 700; }
h2 { font-size: var(--text-xl); font-weight: 700; }
h3 { font-size: var(--text-lg); font-weight: 700; }
a { color: var(--color-link); }

.container { max-width: 72rem; margin: 0 auto; padding: 0 1.5rem; }
.fs-xs { font-size: var(--text-xs); }
.fs-sm { font-size: var(--text-sm); }
.fs-lg { font-size: var(--text-lg); }
.fs-xl { font-size: var(--text-xl); }
.text-muted { color: var(--text-muted); }
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm run test -- tests/tokens.test.ts`
Expected: PASS

- [ ] **Step 5：建立 `src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/tokens.css';
interface Props { title: string; description?: string; lang?: string; }
const { title, description = '整合台灣無人機足球賽事、規則、隊伍、場地與器材的入口平台。', lang = 'zh-Hant' } = Astro.props;
---
<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
    <slot name="head" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 6：寫 `url()` 失敗測試 `tests/url.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { url } from '../src/lib/url';

describe('url helper', () => {
  it('接上 base 前綴（測試環境 BASE_URL 預設為 "/"）', () => {
    expect(url('/events')).toBe('/events');
    expect(url('/')).toBe('/');
  });
});
```

- [ ] **Step 7：跑測試確認失敗**

Run: `npm run test -- tests/url.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 8：建立 `src/lib/url.ts`**

```ts
// 站內連結一律經此函式，讓連結自動帶上部署 base 前綴。
// 傳入以 '/' 開頭的站內絕對路徑；回傳含 base 的路徑。
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + path;
}
```

- [ ] **Step 9：跑測試確認通過**

Run: `npm run test -- tests/url.test.ts`
Expected: PASS

- [ ] **Step 10：Commit**

```bash
git add -A
git commit -m "feat: design-tokens 全域 CSS、BaseLayout 與 url() 連結工具

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 列舉常數與中文標籤（lib）

**Files:**
- Create: `src/lib/enums.ts`
- Test: `tests/enums.test.ts`

**Interfaces:**
- Produces:
  - `EVENT_STATUS` (readonly string[])、`eventStatusLabel(s: string): string`
  - `VERIFICATION` (readonly string[])、`verificationLabel(v: string): string`
  - `TRUST_LEVEL = ['A','B','C','D']`、`RULE_SYSTEM = ['FAI','FIDA','MOE','OTHER']`
  - Task 4/5/8 的 schema 與頁面會 import 這些常數。

- [ ] **Step 1：寫失敗測試 `tests/enums.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { eventStatusLabel, verificationLabel, EVENT_STATUS, RULE_SYSTEM } from '../src/lib/enums';

describe('enums', () => {
  it('賽事狀態中文標籤', () => {
    expect(eventStatusLabel('registration_open')).toBe('開放報名');
    expect(eventStatusLabel('completed')).toBe('已結束');
  });
  it('驗證狀態中文標籤', () => {
    expect(verificationLabel('official')).toBe('官方資料');
    expect(verificationLabel('source_confirmed')).toBe('已確認來源');
  });
  it('未知值回傳原字串', () => {
    expect(eventStatusLabel('zzz')).toBe('zzz');
  });
  it('狀態與規則體系清單完整', () => {
    expect(EVENT_STATUS).toContain('results_pending');
    expect(RULE_SYSTEM).toEqual(['FAI', 'FIDA', 'MOE', 'OTHER']);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run test -- tests/enums.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3：建立 `src/lib/enums.ts`**

```ts
export const EVENT_STATUS = [
  'draft', 'announced', 'registration_open', 'registration_closed',
  'cancelled', 'postponed', 'ongoing', 'completed', 'results_pending', 'archived',
] as const;

const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: '草稿', announced: '已公告', registration_open: '開放報名',
  registration_closed: '報名截止', cancelled: '已取消', postponed: '延期',
  ongoing: '進行中', completed: '已結束', results_pending: '成績待確認', archived: '已封存',
};

export const VERIFICATION = [
  'unverified', 'community_submitted', 'source_confirmed',
  'organizer_verified', 'official', 'disputed', 'outdated',
] as const;

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: '未驗證', community_submitted: '使用者提供', source_confirmed: '已確認來源',
  organizer_verified: '主辦單位驗證', official: '官方資料', disputed: '資料有爭議', outdated: '資料可能過期',
};

export const TRUST_LEVEL = ['A', 'B', 'C', 'D'] as const;
export const RULE_SYSTEM = ['FAI', 'FIDA', 'MOE', 'OTHER'] as const;

export const eventStatusLabel = (s: string): string => EVENT_STATUS_LABEL[s] ?? s;
export const verificationLabel = (v: string): string => VERIFICATION_LABEL[v] ?? v;
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm run test -- tests/enums.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: 列舉常數與中文標籤

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Content Collections Zod schema

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/events/.gitkeep`（空）
- Create: `src/content/rulebooks/.gitkeep`
- Create: `src/content/rules/.gitkeep`
- Create: `src/content/teams/.gitkeep`
- Create: `src/content/venues/.gitkeep`
- Create: `src/content/equipment/.gitkeep`
- Create: `src/content/organizations/.gitkeep`
- Create: `src/content/learn/.gitkeep`

**Interfaces:**
- Consumes: `src/lib/enums.ts` 的 `EVENT_STATUS`、`VERIFICATION`、`TRUST_LEVEL`、`RULE_SYSTEM`。
- Produces: collections `events`、`rulebooks`、`rules`、`teams`、`venues`、`equipment`、`organizations`、`learn`。共用 `sourceSchema`（Task 6、8 會用）。`event` entry 型別關鍵欄位：`title, subtitle?, status, event_type?, level?, rule_system, schedule{...}, eligibility{...}, competition{...}, registration_url?, sources[], verification`。

- [ ] **Step 1：建立 `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { EVENT_STATUS, VERIFICATION, TRUST_LEVEL, RULE_SYSTEM } from './lib/enums';

const sourceSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  url: z.string().url(),
  publisher: z.string().optional(),
  published_at: z.string().optional(),
  retrieved_at: z.string().optional(),
  trust_level: z.enum(TRUST_LEVEL),
  content_hash: z.string().optional(),
});

const yml = (dir: string) => glob({ pattern: '**/*.yml', base: `./src/content/${dir}` });

const events = defineCollection({
  loader: yml('events'),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    event_series: z.string().optional(),
    status: z.enum(EVENT_STATUS),
    event_type: z.string().optional(),
    level: z.string().optional(),
    organizer: z.string().optional(),
    rule_system: z.enum(RULE_SYSTEM),
    rulebook: z.string().optional(),        // 對應 rulebooks 的 slug
    registration_url: z.string().url().optional(),
    schedule: z.object({
      registration_start: z.string().optional(),
      registration_end: z.string().optional(),
      event_start: z.string().optional(),
      event_end: z.string().optional(),
      venue_name: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }).default({}),
    eligibility: z.object({
      education_levels: z.array(z.string()).optional(),
      team_size_min: z.number().optional(),
      team_size_max: z.number().optional(),
    }).default({}),
    competition: z.object({
      drone_class: z.string().optional(),
      drone_diameter: z.string().optional(),
      active_drones_per_team: z.number().optional(),
    }).default({}),
    results: z.object({
      champion_team: z.string().optional(),     // 隊伍名，不含個資
      runner_up_team: z.string().optional(),
      third_place_team: z.string().optional(),
    }).optional(),
    sources: z.array(sourceSchema).min(1),
    verification: z.enum(VERIFICATION),
  }),
});

const rulebooks = defineCollection({
  loader: yml('rulebooks'),
  schema: z.object({
    name: z.string(),
    organization: z.string(),
    rule_system: z.enum(RULE_SYSTEM),
    version: z.string(),
    language: z.string().default('zh-Hant'),
    published_at: z.string().optional(),
    effective_from: z.string().optional(),
    source_document_url: z.string().url().optional(),
    official_translation: z.boolean().default(false),
    sources: z.array(sourceSchema).min(1),
    verification: z.enum(VERIFICATION),
  }),
});

const rules = defineCollection({
  loader: yml('rules'),
  schema: z.object({
    rulebook: z.string(),                 // rulebooks slug
    chapter: z.string().optional(),
    article_number: z.string().optional(),
    title: z.string(),
    summary: z.string().optional(),
    original_text: z.string().optional(),
    translated_text: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source_page: z.string().optional(),
  }),
});

const teams = defineCollection({
  loader: yml('teams'),
  // 個資邊界：本 schema 不得含選手個資欄位
  schema: z.object({
    name: z.string(),
    english_name: z.string().optional(),
    team_type: z.string(),
    organization: z.string().optional(),  // organizations slug
    city: z.string().optional(),
    district: z.string().optional(),
    introduction: z.string().optional(),
    recruitment_status: z.string().optional(),
    verification: z.enum(VERIFICATION),
  }),
});

const venues = defineCollection({
  loader: yml('venues'),
  schema: z.object({
    name: z.string(),
    venue_type: z.string(),
    address: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    indoor: z.boolean().optional(),
    booking_method: z.string().optional(),
    verification: z.enum(VERIFICATION),
  }),
});

const equipment = defineCollection({
  loader: yml('equipment'),
  schema: z.object({
    brand: z.string(),
    model: z.string(),
    diameter_mm: z.number().optional(),
    weight_g: z.number().optional(),
    motor_type: z.string().optional(),
    battery_voltage: z.string().optional(),
    list_price: z.string().optional(),
    sources: z.array(sourceSchema).optional(),
  }),
});

const organizations = defineCollection({
  loader: yml('organizations'),
  schema: z.object({
    name: z.string(),
    org_type: z.string(),                 // school / association / vendor ...
    city: z.string().optional(),
    website: z.string().url().optional(),
  }),
});

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().default(0),
    updated_at: z.string().optional(),
  }),
});

export const collections = { events, rulebooks, rules, teams, venues, equipment, organizations, learn };
```

- [ ] **Step 2：建立各 collection 的 `.gitkeep`**

Run:
```bash
for d in events rulebooks rules teams venues equipment organizations learn; do mkdir -p "src/content/$d" && touch "src/content/$d/.gitkeep"; done
```

- [ ] **Step 3：同步型別並驗證 build**

Run: `npx astro sync && npm run build`
Expected：`astro sync` 產生 `.astro/types.d.ts`，build 成功（此時 collection 為空，合法）。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "feat: 8 個 collection 的 Zod schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: JSON-LD 結構化資料產生器（lib）

**Files:**
- Create: `src/lib/jsonld.ts`
- Test: `tests/jsonld.test.ts`

**Interfaces:**
- Consumes: 無（純函式，輸入 plain object）。
- Produces:
  - `eventJsonLd(e: EventInput): object` → `@type: "SportsEvent"`
  - `faqJsonLd(items: {q: string; a: string}[]): object` → `@type: "FAQPage"`
  - `breadcrumbJsonLd(items: {name: string; url: string}[]): object` → `@type: "BreadcrumbList"`
  - Task 8、9 頁面會 import。

- [ ] **Step 1：寫失敗測試 `tests/jsonld.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { eventJsonLd, faqJsonLd, breadcrumbJsonLd } from '../src/lib/jsonld';

describe('jsonld', () => {
  it('賽事 SportsEvent', () => {
    const j = eventJsonLd({ name: '天穹盃台北戰', startDate: '2026-08-01', url: 'https://twdro.net/events/x', locationName: '台北體育館' });
    expect(j['@type']).toBe('SportsEvent');
    expect(j.name).toBe('天穹盃台北戰');
    expect(j.location.name).toBe('台北體育館');
  });
  it('FAQPage', () => {
    const j = faqJsonLd([{ q: '一隊幾人?', a: '3 到 5 人' }]);
    expect(j['@type']).toBe('FAQPage');
    expect(j.mainEntity[0].acceptedAnswer.text).toBe('3 到 5 人');
  });
  it('BreadcrumbList', () => {
    const j = breadcrumbJsonLd([{ name: '首頁', url: 'https://twdro.net/' }]);
    expect(j['@type']).toBe('BreadcrumbList');
    expect(j.itemListElement[0].position).toBe(1);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run test -- tests/jsonld.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3：建立 `src/lib/jsonld.ts`**

```ts
export interface EventInput {
  name: string;
  startDate?: string;
  endDate?: string;
  url: string;
  locationName?: string;
}

export function eventJsonLd(e: EventInput): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: e.name,
    ...(e.startDate ? { startDate: e.startDate } : {}),
    ...(e.endDate ? { endDate: e.endDate } : {}),
    url: e.url,
    ...(e.locationName ? { location: { '@type': 'Place', name: e.locationName } } : {}),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((i, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: i.name,
      item: i.url,
    })),
  };
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm run test -- tests/jsonld.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: JSON-LD 結構化資料產生器

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 共用元件（狀態徽章、來源標示、頁首頁尾）

**Files:**
- Create: `src/components/StatusBadge.astro`
- Create: `src/components/SourceBlock.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/SiteFooter.astro`
- Modify: `src/layouts/BaseLayout.astro`（插入 header/footer）

**Interfaces:**
- Consumes: `src/lib/enums.ts` 的 `eventStatusLabel`、`verificationLabel`。
- Produces:
  - `StatusBadge`，props `{ status: string }` → 依狀態上色的中文徽章。
  - `SourceBlock`，props `{ sources: {type:string; url:string; published_at?:string; retrieved_at?:string; trust_level:string}[]; verification: string }` → 頁尾「資料來源／查核日期／狀態」區塊（對應 spec §3.2）。
  - `SiteHeader`（導覽：賽事/規則/隊伍/器材/學習/關於）、`SiteFooter`。

- [ ] **Step 1：建立 `src/components/StatusBadge.astro`**

```astro
---
import { eventStatusLabel } from '../lib/enums';
interface Props { status: string; }
const { status } = Astro.props;
const openish = status === 'registration_open' || status === 'ongoing';
const done = status === 'completed' || status === 'archived';
const color = openish ? 'var(--color-pass)' : done ? 'var(--text-muted)' : 'var(--color-low)';
---
<span class="fs-xs" style={`display:inline-block;padding:.15em .6em;border-radius:.4em;font-weight:600;color:#fff;background:${color}`}>
  {eventStatusLabel(status)}
</span>
```

- [ ] **Step 2：建立 `src/components/SourceBlock.astro`**

```astro
---
import { verificationLabel } from '../lib/enums';
interface SourceItem { type: string; url: string; published_at?: string; retrieved_at?: string; trust_level: string; }
interface Props { sources: SourceItem[]; verification: string; }
const { sources, verification } = Astro.props;
---
<aside class="fs-sm text-muted" style="margin-top:2rem;border-top:1px solid var(--border-subtle);padding-top:1rem">
  <p style="margin:.2rem 0"><strong>資料狀態：</strong>{verificationLabel(verification)}</p>
  <p style="margin:.2rem 0"><strong>資料來源：</strong></p>
  <ul style="margin:.2rem 0">
    {sources.map((s) => (
      <li>
        <a href={s.url} rel="nofollow noopener" target="_blank">{s.type}</a>
        （信度 {s.trust_level}
        {s.published_at ? `｜發布 ${s.published_at}` : ''}
        {s.retrieved_at ? `｜查核 ${s.retrieved_at}` : ''}）
      </li>
    ))}
  </ul>
</aside>
```

- [ ] **Step 3：建立 `src/components/SiteHeader.astro`**

```astro
---
import { url } from '../lib/url';
// 計畫一只放已建成的頁；/teams、/equipment 於計畫二補頁面時再加入
const nav = [
  ['/events', '賽事'], ['/rules', '規則'],
  ['/learn', '認識無人機足球'], ['/about', '關於'],
];
---
<header style="border-bottom:1px solid var(--border-subtle);background:var(--bg-surface)">
  <div class="container" style="display:flex;gap:1.5rem;align-items:center;padding-top:1rem;padding-bottom:1rem;flex-wrap:wrap">
    <a href={url('/')} style="font-weight:700;font-size:var(--text-lg);text-decoration:none">twdro.net</a>
    <nav style="display:flex;gap:1.2rem;flex-wrap:wrap">
      {nav.map(([href, label]) => <a href={url(href)} class="fs-sm">{label}</a>)}
    </nav>
  </div>
</header>
```

- [ ] **Step 4：建立 `src/components/SiteFooter.astro`**

```astro
---
import { url } from '../lib/url';
const links = [
  ['/about', '平台使命'], ['/about/sources', '資料來源'], ['/about/correction', '回報資料錯誤'],
  ['/about/privacy', '隱私權政策'], ['/about/terms', '使用條款'], ['/about/disclaimer', '免責聲明'],
];
---
<footer style="border-top:1px solid var(--border-subtle);background:var(--bg-surface);margin-top:3rem">
  <div class="container fs-sm text-muted" style="padding-top:1.5rem;padding-bottom:1.5rem">
    <nav style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.5rem">
      {links.map(([href, label]) => <a href={url(href)}>{label}</a>)}
    </nav>
    <p style="margin:0">twdro.net — 台灣無人機足球資料與賽事平台</p>
  </div>
</footer>
```

- [ ] **Step 5：修改 `src/layouts/BaseLayout.astro` 插入 header/footer**

將 `<body>` 內容改為：
```astro
  <body>
    <SiteHeader />
    <main class="container" style="padding-top:2rem;padding-bottom:2rem"><slot /></main>
    <SiteFooter />
  </body>
```
並在 frontmatter import：
```astro
import SiteHeader from '../components/SiteHeader.astro';
import SiteFooter from '../components/SiteFooter.astro';
```

- [ ] **Step 6：build 驗證**

Run: `npm run build`
Expected：build 成功。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "feat: 狀態徽章、來源標示、頁首頁尾元件

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 認識無人機足球（learn）頁

**Files:**
- Create: `src/content/learn/what-is-drone-soccer.md`
- Create: `src/content/learn/naming-drone-soccer-vs-flyball.md`
- Create: `src/pages/learn/index.astro`
- Create: `src/pages/learn/[...slug].astro`

**Interfaces:**
- Consumes: `learn` collection、`BaseLayout`。
- Produces: `/learn`（文章列表，依 `order`）、`/learn/<slug>`（文章內文）。

- [ ] **Step 1：建立第一篇文章 `src/content/learn/what-is-drone-soccer.md`**

```md
---
title: 什麼是無人機足球？
description: 無人機足球是結合飛行操控、工程與團隊戰術的新興科技運動。
order: 1
updated_at: 2026-07-19
---

無人機足球（Drone Soccer，又稱無人機飛球）是一項結合飛行操控、工程技術、
團隊戰術與競技運動的新興科技運動。選手駕駛包覆在防護球殼內的小型無人機，
在指定場地內互相攻防，由「前鋒機」穿越對方球門得分。

本文之後由編輯補充：場地、球門、得分方式、與傳統足球的差異。
```

- [ ] **Step 2：建立第二篇 `src/content/learn/naming-drone-soccer-vs-flyball.md`**

```md
---
title: 無人機足球和無人機飛球有什麼不同？
description: 釐清「無人機足球」與「無人機飛球」兩個常見稱呼。
order: 2
updated_at: 2026-07-19
---

「無人機足球」與「無人機飛球」多數情況指同一項運動（Drone Soccer）。
本平台以「無人機足球」為正式分類與主要關鍵字，「無人機飛球」則作為
同義詞、民間賽事名稱與口語稱呼。
```

- [ ] **Step 3：建立列表頁 `src/pages/learn/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
const articles = (await getCollection('learn')).sort((a, b) => a.data.order - b.data.order);
---
<BaseLayout title="認識無人機足球 | twdro.net">
  <h1>認識無人機足球</h1>
  <ul>
    {articles.map((a) => (
      <li style="margin:.6rem 0">
        <a href={url(`/learn/${a.id}`)} class="fs-lg">{a.data.title}</a>
        <p class="fs-sm text-muted" style="margin:.2rem 0">{a.data.description}</p>
      </li>
    ))}
  </ul>
</BaseLayout>
```

- [ ] **Step 4：建立內文頁 `src/pages/learn/[...slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
export async function getStaticPaths() {
  const articles = await getCollection('learn');
  return articles.map((a) => ({ params: { slug: a.id }, props: { article: a } }));
}
const { article } = Astro.props;
const { Content } = await render(article);
---
<BaseLayout title={`${article.data.title} | twdro.net`} description={article.data.description}>
  <article>
    <h1>{article.data.title}</h1>
    {article.data.updated_at && <p class="fs-sm text-muted">更新：{article.data.updated_at}</p>}
    <Content />
  </article>
</BaseLayout>
```

- [ ] **Step 5：build 驗證內容存在**

Run:
```bash
npm run build && grep -rq "什麼是無人機足球" dist/learn/ && echo OK
```
Expected：輸出 `OK`。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: 認識無人機足球列表與內文頁

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 規則頁（rulebook 列表與詳細）

**Files:**
- Create: `src/content/rulebooks/fai-f9a-b-2026.yml`
- Create: `src/content/rules/fai-f9a-b-2026-teamsize.yml`
- Create: `src/pages/rules/index.astro`
- Create: `src/pages/rules/[slug].astro`

**Interfaces:**
- Consumes: `rulebooks`、`rules` collections、`SourceBlock`、`BaseLayout`。
- Produces: `/rules`（規則體系列表）、`/rules/<slug>`（rulebook 詳細＋掛在其下的 rule 條文）。

- [ ] **Step 1：建立 rulebook 種子 `src/content/rulebooks/fai-f9a-b-2026.yml`**

```yaml
name: FAI F9A-B 2026
organization: FAI
rule_system: FAI
version: '2026'
language: en
published_at: 2026-01-01
source_document_url: https://www.fai.org/
official_translation: false
verification: source_confirmed
sources:
  - type: fai_official
    url: https://www.fai.org/
    trust_level: A
    retrieved_at: 2026-07-19
```

- [ ] **Step 2：建立 rule 種子 `src/content/rules/fai-f9a-b-2026-teamsize.yml`**

```yaml
rulebook: fai-f9a-b-2026
chapter: 隊伍
article_number: '3.1'
title: 場上人數
summary: FAI 規則允許主辦單位在公告中決定每隊 3 至 5 名場上選手。
source_page: '12'
tags:
  - 場上人數
  - 隊伍
```

- [ ] **Step 3：建立列表頁 `src/pages/rules/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
const books = await getCollection('rulebooks');
const systems = ['FAI', 'FIDA', 'MOE', 'OTHER'];
---
<BaseLayout title="規則總覽 | twdro.net">
  <h1>規則總覽</h1>
  <p class="text-muted fs-sm">FAI、FIDA、教育部與各民間賽事規則各自獨立，請勿跨體系混用。</p>
  {systems.map((sys) => {
    const list = books.filter((b) => b.data.rule_system === sys);
    return list.length ? (
      <section>
        <h2>{sys}</h2>
        <ul>{list.map((b) => <li><a href={url(`/rules/${b.id}`)} class="fs-lg">{b.data.name}</a></li>)}</ul>
      </section>
    ) : null;
  })}
</BaseLayout>
```

- [ ] **Step 4：建立詳細頁 `src/pages/rules/[slug].astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import SourceBlock from '../../components/SourceBlock.astro';
export async function getStaticPaths() {
  const books = await getCollection('rulebooks');
  const rules = await getCollection('rules');
  return books.map((b) => ({
    params: { slug: b.id },
    props: { book: b, rules: rules.filter((r) => r.data.rulebook === b.id) },
  }));
}
const { book, rules } = Astro.props;
---
<BaseLayout title={`${book.data.name} | twdro.net`}>
  <article>
    <h1>{book.data.name}</h1>
    <p class="fs-sm text-muted">制定：{book.data.organization}｜版本：{book.data.version}
      {book.data.official_translation ? '｜官方翻譯' : '｜非官方翻譯（僅供參考）'}</p>
    {book.data.source_document_url && <p><a href={book.data.source_document_url} rel="nofollow noopener" target="_blank">原始官方文件 ↗</a></p>}
    {rules.map((r) => (
      <section style="border-top:1px solid var(--border-subtle);padding-top:1rem">
        <h3>{r.data.article_number} {r.data.title}</h3>
        {r.data.summary && <p>{r.data.summary}</p>}
        {r.data.source_page && <p class="fs-xs text-muted">來源頁：{r.data.source_page}</p>}
      </section>
    ))}
    <SourceBlock sources={book.data.sources} verification={book.data.verification} />
  </article>
</BaseLayout>
```

- [ ] **Step 5：build 驗證**

Run:
```bash
npm run build && grep -rq "FAI F9A-B 2026" dist/rules/ && echo OK
```
Expected：輸出 `OK`。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: 規則總覽與詳細頁

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 賽事頁（列表與詳細，含 JSON-LD）

**Files:**
- Create: `src/content/events/2026-sky-cup-taipei.yml`
- Create: `src/pages/events/index.astro`
- Create: `src/pages/events/[slug].astro`

**Interfaces:**
- Consumes: `events` collection、`StatusBadge`、`SourceBlock`、`eventJsonLd`、`breadcrumbJsonLd`、`BaseLayout`。
- Produces: `/events`（列表，依 `schedule.event_start` 排序）、`/events/<slug>`（詳細＋SportsEvent JSON-LD）。

- [ ] **Step 1：建立賽事種子 `src/content/events/2026-sky-cup-taipei.yml`**

```yaml
title: 2026 第二屆天穹盃・台北戰
subtitle: 民間無人機飛球分站賽
event_series: 天穹盃
status: registration_open
event_type: 分站賽
level: 地方
organizer: 台灣無人機競技發展協會
rule_system: OTHER
rulebook: fai-f9a-b-2026
registration_url: https://example.org/register
schedule:
  registration_end: 2026-07-31
  event_start: 2026-08-15
  venue_name: 台北體育館
  city: 臺北市
eligibility:
  education_levels: [國中, 高中]
  team_size_min: 3
  team_size_max: 5
competition:
  drone_class: F9A-B
  drone_diameter: 20cm
  active_drones_per_team: 3
verification: source_confirmed
sources:
  - type: organizer_announcement
    url: https://example.org/announce
    published_at: 2026-06-01
    retrieved_at: 2026-07-19
    trust_level: A
```

- [ ] **Step 2：建立列表頁 `src/pages/events/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import StatusBadge from '../../components/StatusBadge.astro';
import { url } from '../../lib/url';
const events = (await getCollection('events'))
  .sort((a, b) => (a.data.schedule.event_start ?? '').localeCompare(b.data.schedule.event_start ?? ''));
---
<BaseLayout title="賽事 | twdro.net">
  <h1>賽事</h1>
  <ul style="list-style:none;padding:0">
    {events.map((e) => (
      <li style="border:1px solid var(--border-subtle);border-radius:.5em;padding:1rem;margin:.8rem 0;background:var(--bg-surface)">
        <StatusBadge status={e.data.status} />
        <a href={url(`/events/${e.id}`)} class="fs-lg" style="display:block;margin-top:.4rem">{e.data.title}</a>
        <p class="fs-sm text-muted" style="margin:.3rem 0">
          {e.data.schedule.event_start ?? '日期未定'}｜{e.data.schedule.city ?? ''}｜{e.data.schedule.venue_name ?? ''}
        </p>
      </li>
    ))}
  </ul>
</BaseLayout>
```

- [ ] **Step 3：建立詳細頁 `src/pages/events/[slug].astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import StatusBadge from '../../components/StatusBadge.astro';
import SourceBlock from '../../components/SourceBlock.astro';
import { eventJsonLd } from '../../lib/jsonld';
import { url } from '../../lib/url';
export async function getStaticPaths() {
  const events = await getCollection('events');
  return events.map((e) => ({ params: { slug: e.id }, props: { event: e } }));
}
const { event } = Astro.props;
const d = event.data;
const jsonld = eventJsonLd({
  name: d.title,
  startDate: d.schedule.event_start,
  endDate: d.schedule.event_end,
  // 站內連結一律經 url() 帶上 base，JSON-LD 的 canonical url 亦同
  url: new URL(url(`/events/${event.id}`), Astro.site).toString(),
  locationName: d.schedule.venue_name,
});
---
<BaseLayout title={`${d.title} | twdro.net`} description={d.subtitle}>
  <script type="application/ld+json" slot="head" set:html={JSON.stringify(jsonld)} />
  <article>
    <StatusBadge status={d.status} />
    <h1>{d.title}</h1>
    {d.subtitle && <p class="fs-lg text-muted">{d.subtitle}</p>}
    <h2>基本資訊</h2>
    <ul>
      <li>主辦：{d.organizer ?? '—'}</li>
      <li>規則體系：{d.rule_system}</li>
      <li>日期：{d.schedule.event_start ?? '未定'}</li>
      <li>地點：{d.schedule.city ?? ''} {d.schedule.venue_name ?? ''}</li>
      <li>報名截止：{d.schedule.registration_end ?? '未定'}</li>
    </ul>
    <h2>參賽資格</h2>
    <ul>
      <li>組別：{(d.eligibility.education_levels ?? []).join('、') || '—'}</li>
      <li>隊伍人數：{d.eligibility.team_size_min ?? '?'}–{d.eligibility.team_size_max ?? '?'} 人</li>
    </ul>
    <h2>球機規格</h2>
    <ul>
      <li>級別：{d.competition.drone_class ?? '—'}</li>
      <li>直徑：{d.competition.drone_diameter ?? '—'}</li>
      <li>場上球機：{d.competition.active_drones_per_team ?? '—'}</li>
    </ul>
    {d.registration_url && <p><a href={d.registration_url} rel="nofollow noopener" target="_blank">前往報名 ↗</a></p>}
    <SourceBlock sources={d.sources} verification={d.verification} />
  </article>
</BaseLayout>
```

- [ ] **Step 4：build 驗證含 JSON-LD**

Run:
```bash
npm run build && grep -rq "SportsEvent" dist/events/ && grep -rq "天穹盃" dist/events/ && echo OK
```
Expected：輸出 `OK`。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat: 賽事列表與詳細頁（含 SportsEvent JSON-LD）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 首頁

**Files:**
- Modify: `src/pages/index.astro`（取代 Task 1 占位）

**Interfaces:**
- Consumes: `events` collection、`StatusBadge`、`BaseLayout`。
- Produces: `/`，含第一屏（主標＋副標＋CTA）、「下一場比賽」、近期賽事、認識入口。

- [ ] **Step 1：改寫 `src/pages/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import StatusBadge from '../components/StatusBadge.astro';
import { url } from '../lib/url';
const events = (await getCollection('events'))
  .sort((a, b) => (a.data.schedule.event_start ?? '').localeCompare(b.data.schedule.event_start ?? ''));
const next = events.find((e) => e.data.status === 'registration_open' || e.data.status === 'announced') ?? events[0];
const recent = events.slice(0, 4);
---
<BaseLayout title="台灣無人機足球的一站式入口 | twdro.net">
  <section style="text-align:center;padding:2rem 0">
    <h1>台灣無人機足球的一站式入口</h1>
    <p class="fs-lg text-muted">整合全台無人機足球與無人機飛球的賽事、規則、隊伍、場地、課程、器材及歷史成績。</p>
    <p style="margin-top:1.5rem">
      <a href={url('/events')} class="fs-lg" style="margin:0 .8rem">查看近期賽事</a>
      <a href={url('/learn')} class="fs-lg" style="margin:0 .8rem">認識無人機足球</a>
    </p>
  </section>

  {next && (
    <section style="border:1px solid var(--border-subtle);border-radius:.5em;padding:1.5rem;background:var(--bg-surface)">
      <h2>下一場比賽</h2>
      <StatusBadge status={next.data.status} />
      <a href={url(`/events/${next.id}`)} class="fs-xl" style="display:block;margin:.5rem 0">{next.data.title}</a>
      <p class="text-muted">{next.data.schedule.event_start ?? '日期未定'}｜{next.data.schedule.city ?? ''}｜報名截止 {next.data.schedule.registration_end ?? '未定'}</p>
    </section>
  )}

  <section>
    <h2>近期賽事</h2>
    <ul style="list-style:none;padding:0">
      {recent.map((e) => (
        <li style="padding:.6rem 0;border-bottom:1px solid var(--border-subtle)">
          <StatusBadge status={e.data.status} />
          <a href={url(`/events/${e.id}`)} style="margin-left:.5rem">{e.data.title}</a>
        </li>
      ))}
    </ul>
  </section>
</BaseLayout>
```

- [ ] **Step 2：build 驗證**

Run:
```bash
npm run build && grep -q "台灣無人機足球的一站式入口" dist/index.html && echo OK
```
Expected：輸出 `OK`。

- [ ] **Step 3：Commit**

```bash
git add -A
git commit -m "feat: 首頁（第一屏＋下一場比賽＋近期賽事）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 關於平台與法遵頁

**Files:**
- Create: `src/pages/about/index.astro`
- Create: `src/pages/about/sources.astro`
- Create: `src/pages/about/correction.astro`
- Create: `src/pages/about/privacy.astro`
- Create: `src/pages/about/terms.astro`
- Create: `src/pages/about/disclaimer.astro`

**Interfaces:**
- Consumes: `BaseLayout`。
- Produces: `/about` 及五個法遵/說明子頁。`correction` 提供 GitHub Issue 連結作為回報入口。

- [ ] **Step 1：建立 `src/pages/about/index.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
---
<BaseLayout title="平台使命 | twdro.net">
  <h1>平台使命</h1>
  <p>我們整理分散在政府公告、學校網站、協會社群、賽事簡章與國際規則中的資料，
    讓選手、家長、教師、教練與主辦單位，可以在同一個平台找到需要的資訊。</p>
  <h2>平台承諾</h2>
  <ul>
    <li>清楚標示資料來源</li>
    <li>保存規則與簡章版本</li>
    <li>區分不同賽事規則，不混用</li>
    <li>提供資料更正機制</li>
    <li>保護未成年選手隱私</li>
    <li>不以平台解讀取代正式規則與裁判判定</li>
  </ul>
  <p class="fs-sm text-muted">相關頁面：
    <a href={url('/about/sources')}>資料來源</a>、
    <a href={url('/about/correction')}>回報資料錯誤</a>、
    <a href={url('/about/privacy')}>隱私權政策</a>、
    <a href={url('/about/terms')}>使用條款</a>、
    <a href={url('/about/disclaimer')}>免責聲明</a>
  </p>
</BaseLayout>
```

- [ ] **Step 2：建立 `src/pages/about/sources.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout title="資料來源與編輯原則 | twdro.net">
  <h1>資料來源與編輯原則</h1>
  <p>本平台資料依可信度分四級：</p>
  <ul>
    <li><strong>A 級</strong>：第一手官方（主辦公告、教育部/國教署、FAI、FIDA、正式簡章與成績）</li>
    <li><strong>B 級</strong>：官方轉知（學校、大學、場館、協辦單位公告）</li>
    <li><strong>C 級</strong>：可信二手（新聞、器材商、教練或隊伍官方帳號）</li>
    <li><strong>D 級</strong>：使用者提供（投稿，須經審核，不覆寫已驗證資料）</li>
  </ul>
  <p>每筆重要資料在頁尾標示來源、發布日期、平台查核日期與資料狀態。</p>
</BaseLayout>
```

- [ ] **Step 3：建立 `src/pages/about/correction.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
const issueUrl = 'https://github.com/yao-care/twdro.net/issues/new?labels=data-correction&title=資料更正：';
---
<BaseLayout title="回報資料錯誤 | twdro.net">
  <h1>回報資料錯誤</h1>
  <p>發現資料有誤？請提供：資料頁網址、錯誤欄位、建議內容、來源證明。</p>
  <p><a href={issueUrl} rel="noopener" target="_blank" class="fs-lg">前往 GitHub 提交更正 ↗</a></p>
  <p class="fs-sm text-muted">處理流程：收到回報 → 編輯初審 → 查核來源 →（必要時）聯絡主辦單位 → 更新或維持並留下紀錄。</p>
</BaseLayout>
```

- [ ] **Step 4：建立 `src/pages/about/privacy.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { url } from '../../lib/url';
---
<BaseLayout title="隱私權政策 | twdro.net">
  <h1>隱私權政策</h1>
  <h2>未成年人保護</h2>
  <ul>
    <li>本平台不收錄選手個人個資（完整姓名、生日、聯絡方式、住址）。</li>
    <li>得獎與參賽紀錄僅呈現至隊伍層級。</li>
    <li>提供監護人申請移除機制（見<a href={url('/about/correction')}>回報頁</a>）。</li>
  </ul>
</BaseLayout>
```

- [ ] **Step 5：建立 `src/pages/about/terms.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout title="使用條款 | twdro.net">
  <h1>使用條款</h1>
  <p>本平台為資料索引與資訊整合服務。規則文件以官方原始文件為準；
    平台提供之整理、摘要或非官方翻譯僅供參考。</p>
</BaseLayout>
```

- [ ] **Step 6：建立 `src/pages/about/disclaimer.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout title="免責聲明 | twdro.net">
  <h1>免責聲明</h1>
  <p>本平台之球機合規、規則比較等工具僅提供初步比對，最終參賽資格以主辦單位與
    現場檢錄結果為準。戶外無人機活動之實際適用規範，仍應依活動地點、場地型態、
    設備及主管機關（如交通部民用航空局）最新規定判定。</p>
</BaseLayout>
```

- [ ] **Step 7：build 驗證**

Run:
```bash
npm run build && grep -rq "未成年人保護" dist/about/ && grep -rq "免責聲明" dist/about/ && echo OK
```
Expected：輸出 `OK`。

- [ ] **Step 8：Commit**

```bash
git add -A
git commit -m "feat: 關於平台與法遵頁（使命/來源/更正/隱私/條款/免責）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 全站建置驗收與 README

**Files:**
- Create: `README.md`
- Test: `tests/build-smoke.test.ts`

**Interfaces:**
- Consumes: 全部前述任務。
- Produces: 一次完整 build 驗收；README 說明資料維護方式。

- [ ] **Step 1：寫 build smoke 測試 `tests/build-smoke.test.ts`**

```ts
import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// 前置：需先執行 `npm run build`
describe('build smoke', () => {
  const pages = [
    'dist/index.html',
    'dist/events/index.html',
    'dist/rules/index.html',
    'dist/learn/index.html',
    'dist/about/index.html',
    'dist/about/privacy/index.html',
  ];
  for (const p of pages) {
    it(`產出 ${p}`, () => { expect(existsSync(p)).toBe(true); });
  }
});
```

- [ ] **Step 2：完整 build 後跑測試**

Run:
```bash
npm run build && npm run test -- tests/build-smoke.test.ts
```
Expected：build 成功，測試全 PASS。

- [ ] **Step 3：建立 `README.md`**

```md
# twdro.net — 台灣無人機足球資料與賽事平台

靜態網站（Astro + GitHub Pages），資料由 `src/content/` 內的 YAML/Markdown 驅動。

## 開發
```bash
npm install
npm run dev      # 本地預覽
npm run build    # 產出 dist/
npm run test     # 單元測試
```

## 資料維護
- 賽事：`src/content/events/<slug>.yml`
- 規則：`src/content/rulebooks/`、`src/content/rules/`
- 隊伍/場地/器材/組織：對應 `src/content/` 子目錄
- 文章：`src/content/learn/<slug>.md`

新增資料 = 新增檔案（檔名即網址）。所有欄位由 `src/content.config.ts` 的 Zod schema 驗證，
缺欄位或狀態值錯誤會使 build 失敗。**不得在 `teams` 加入選手個資欄位。**

## 部署
push 到 `main` 由 `.github/workflows/deploy.yml` 自動建置並發佈至 GitHub Pages。
- **現階段（DNS 未設）**：服務於 `https://yao-care.github.io/twdro.net/`（`astro.config.mjs` 的 `base: '/twdro.net'`）。
- **綁定 `twdro.net` 後**：將 `base` 改為 `/`、`site` 改為 `https://twdro.net`、新增 `public/CNAME`（內容 `twdro.net`），並於 Pages 設定填入自訂網域。
```

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "chore: build 驗收測試與 README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（對照設計文件）：**
- §2 技術骨架（Astro/tokens CSS/部署/CNAME）→ Task 1、2 ✅
- §3 Repo 與資料架構（8 collection schema、來源內嵌、個資邊界、slug=URL）→ Task 4 ✅
- §2.1 design-tokens 字級/配色 → Task 2 ✅
- §6 頁面（首頁、賽事列表/詳細、規則總覽/詳細、認識、關於/法遵）→ Task 7–11 ✅
- §6.2 SEO（固定 URL、JSON-LD）→ Task 5、9 ✅
- §9 法遵（更正入口、隱私、免責、不 rehost）→ Task 11 ✅
- **本計畫範圍外（計畫二/三）**：隊伍/場地/器材頁、合規檢查器、規則比較器、地圖、搜尋、pipeline、CKIP。頁面表中 teams/venues/equipment 的 schema 已於 Task 4 先備妥，頁面本身留計畫二。
- **缺口**：`organizations`/`teams`/`venues`/`equipment` collection 已定 schema 但本計畫無對應頁面 —— 這是刻意的（列入計畫二），非遺漏。Task 6 導覽列已只保留計畫一完成的頁面（`/teams`、`/equipment` 留待計畫二加入），計畫一單獨上線無死連結。

**Placeholder 掃描：** 無 TBD/TODO；每個 code step 均含完整程式碼。文章內文有「之後由編輯補充」屬**內容種子**（資料，非程式），合理。

**型別一致性：** `eventStatusLabel`/`verificationLabel`（Task 3）↔ StatusBadge/SourceBlock（Task 6）一致；`eventJsonLd` 簽章（Task 5）↔ 賽事詳細頁呼叫（Task 9）一致；`sources`/`verification` 欄位（Task 4 schema）↔ SourceBlock props（Task 6）↔ 種子資料（Task 8、9）一致。
