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
