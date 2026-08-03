import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { EVENT_STATUS, VERIFICATION, TRUST_LEVEL, RULE_SYSTEM, LEARN_CATEGORY } from './lib/enums';

const sourceSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  url: z.string().url(),
  publisher: z.string().optional(),
  published_at: z.string().optional(),
  retrieved_at: z.string().optional(),
  trust_level: z.enum(TRUST_LEVEL),
  content_hash: z.string().optional(),
  // 原始網址已下架、且找不到替代來源時填上確認日期（YYYY-MM-DD）。
  // 學校與政府網站把過期公告下架是常態，硬刪來源等於抹掉這筆資料的出處；
  // 保留網址並在畫面上標明「已下架」，讀者才知道我們當初依據什麼、何時查核的。
  // scripts/check-source-links.mjs 讀這個欄位判斷哪些 404 是已知的，不必另外維護清單。
  unavailable_since: z.string().optional(),
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
      // 分組別成績（2026-08-03 加）。台灣的學校賽事幾乎都分組別——教育部全國賽本身就有
      // 國中小／高中／大專三組，縣市選拔賽則多為國中組／國小組——只給單組冠亞季的話，
      // 第一筆真實成績（嘉義縣 115 年度選拔賽，雙組別）就得捨棄一半資料。頂層欄位保留，
      // 未分組的賽事照舊填頂層即可，既有 10 筆賽事完全不受影響。
      divisions: z.array(z.object({
        name: z.string(),                       // 組別名，如「國中組」
        champion_team: z.string().optional(),
        runner_up_team: z.string().optional(),
        third_place_team: z.string().optional(),
      })).optional(),
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
    sources: z.array(sourceSchema).optional(),  // 隊伍層級溯源，不含選手個資
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
    org_type: z.string(),                 // school / association / vendor / international_body ...
    city: z.string().optional(),
    // 2026-08-03 加：先前 organizations 全是臺灣單位，連站上到處引用規則書的 FIDA 與 FAI
    // 都不在收錄裡——讀者看得到規則卻查不到規則是誰訂的。加國際組織就需要區分所在國，
    // 只有 city 會讓「洛桑」「首爾」看起來像臺灣的縣市。臺灣單位不填此欄，顯示不變。
    country: z.string().optional(),
    website: z.string().url().optional(),
    // 2026-08-03 加：SERP 實查發現「臺灣哪裡有無人機足球課／營隊」沒有任何人在維護清單
    // （業者各自為政），而本站已經在收錄這些單位了，只差沒說它們開什麼。
    // 一行一項，照原文寫（例：「無人機足球競技體驗營：3 或 6 小時，6–20 人」）。
    // ⚠️ 不寫價格、不做推薦排序（鐵則 5 與編輯中立）；沒查到原文就不填。
    programs: z.array(z.string()).optional(),
    // 「這家有開無人機足球課」是可查證的事實主張，因此比照 events 附來源。
    // 先前 organizations 沒有 sources 欄，是因為收的都是協會／官方單位，名稱本身即公開事實；
    // 一旦開始寫「它開什麼課」，就必須指得出出處。
    sources: z.array(sourceSchema).optional(),
  }),
});

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    category: z.enum(LEARN_CATEGORY),
    order: z.number().default(0),
    updated_at: z.string().optional(),
    // 教育文要引用的即時資料區塊。文章是 .md（無法 import 元件），而把價格／機型寫進
    // markdown 必然與 src/content/equipment 走鐘——鐵則 5 禁止。宣告在 frontmatter，
    // 由 pages/learn/[...slug].astro 在正文之後渲染對應元件，資料仍是單一來源。
    embed: z.enum(['equipment-price-table', 'event-series', 'organizations']).optional(),
    // embed: 'event-series' 時指定要列哪個系列（對應 events YAML 的 event_series）。
    // 值有沒有對應賽事由 tests/learn-claims 守門——打錯字只會渲染出空表，不會 build 失敗。
    embed_series: z.string().optional(),
    /** 賽程表第二欄的欄位名（巡迴賽用「分站」、晉級制用「階段」）；省略時為「賽事」 */
    embed_item_label: z.string().optional(),
  }),
});

const news = defineCollection({
  loader: yml('news'),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    summary: z.string().optional(),
    source_url: z.string().url().optional(),
    source_publisher: z.string().optional(),
  }),
});

export const collections = { events, rulebooks, rules, teams, venues, equipment, organizations, learn, news };
