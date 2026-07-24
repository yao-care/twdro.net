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
    category: z.enum(LEARN_CATEGORY),
    order: z.number().default(0),
    updated_at: z.string().optional(),
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
