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

// organizations 的 org_type 是自由字串（schema 不設 enum，之後冒出新型態不必改 schema）。
// 中文標籤與顯示順序集中在這裡：先前 /organizations/ 索引、明細頁、learn 的 OrganizationsTable
// 各自抄了一份 TYPE_LABEL，新增一種型態就得記得改三個地方——2026-08-03 加
// training_provider 時差點漏掉其中一個。未知值原樣顯示、排到最後，不猜也不吞掉。
const ORG_TYPE_LABEL: Record<string, string> = {
  government: '政府單位', association: '協會', school: '學校', university: '大學',
  vendor: '器材廠商',
  // 開課／營隊單位：實際對外開無人機足球課程、營隊或團建體驗的單位。與 vendor 分開，
  // 因為「賣球機」跟「開課教人飛」是兩件事，讀者問的是「哪裡可以學」。
  training_provider: '開課／營隊單位',
  international_body: '國際組織',
};

export const ORG_TYPE_ORDER = [
  'government', 'association', 'school', 'university',
  'training_provider', 'vendor', 'international_body',
] as const;

export const orgTypeLabel = (t: string): string => ORG_TYPE_LABEL[t] ?? t;

// 教育文（learn）分類：供 learn 索引頁分組。新增文章須指定其一。
export const LEARN_CATEGORY = ['intro', 'rules', 'equipment', 'competing', 'education'] as const;

const LEARN_CATEGORY_LABEL: Record<string, string> = {
  intro: '入門', rules: '規則', equipment: '器材', competing: '參賽', education: '教師與家長',
};

// 索引頁顯示順序（入門 → 規則 → 器材 → 參賽 → 教師與家長）。
export const LEARN_CATEGORY_ORDER = LEARN_CATEGORY;

export const eventStatusLabel = (s: string): string => EVENT_STATUS_LABEL[s] ?? s;
export const verificationLabel = (v: string): string => VERIFICATION_LABEL[v] ?? v;
export const learnCategoryLabel = (c: string): string => LEARN_CATEGORY_LABEL[c] ?? c;

// 公開頁面只顯示非草稿賽事。資料 pipeline 每天自動把擷取到的賽事以 status:draft 抓入 repo，
// 但草稿可能含擷取雜訊/未確認日期，須人工把 status 升級成 announced 等才對外公開。
export const isPublicEvent = (s: string): boolean => s !== 'draft';
