export const SPEC_FIELDS: { key: string; label: string }[] = [
  { key: 'drone_diameter_mm', label: '球徑(mm)' },
  { key: 'drone_weight_g_max', label: '重量上限(g)' },
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

// 規則體系顯示標籤（避免跨體系誤讀）
export const SYSTEM_LABELS: Record<string, string> = {
  FAI: 'FAI',
  FIDA: 'FIDA',
  MOE: '教育部',
  OTHER: '其他',
};

export interface CompareBook { id: string; name: string; system?: string; spec: Record<string, any>; }

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

export function compareRulebooks(books: CompareBook[]) {
  return SPEC_FIELDS
    .map((f) => ({
      key: f.key,
      label: f.label,
      values: books.map((b) => (b.spec ? b.spec[f.key] : undefined)),
    }))
    // 只保留「至少一本已選規則書有填」的欄位列，避免整排空白
    .filter((row) => row.values.some(hasValue));
}
