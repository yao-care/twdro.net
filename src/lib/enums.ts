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
