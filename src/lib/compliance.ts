export interface ComplianceInput {
  diameter_mm?: number;
  weight_g?: number;
  motor_type?: string;
  battery_cells?: string;
}
export type Status = 'pass' | 'fail' | 'unknown' | 'not_applicable';

// 由電池字串解析電芯數（例如 "2S 450mAh" → 2、"4S" → 4）
const parseCells = (v: any): number | null => {
  const m = String(v ?? '').match(/(\d+)\s*[sS]/);
  return m ? Number(m[1]) : null;
};

export function checkCompliance(input: ComplianceInput, spec: Record<string, any>) {
  const fields: { key: string; label: string; input: any; limit: any; status: Status }[] = [];

  const push = (key: string, label: string, inVal: any, limit: any, ok: (i: any, l: any) => boolean) => {
    const noInput = inVal === undefined || inVal === null || inVal === '';
    const noLimit = limit === undefined || limit === null || limit === '';
    if (noInput && noLimit) return; // 使用者未填、規則也未定義 → 與本次比對無關，略過
    let status: Status;
    if (noLimit) status = 'not_applicable';   // 此規則未定義此項限制 → 不列入判定、不影響結論
    else if (noInput) status = 'unknown';      // 規則有限制、使用者未提供 → 待確認
    else status = ok(inVal, limit) ? 'pass' : 'fail';
    fields.push({ key, label, input: inVal ?? '', limit: limit ?? '', status });
  };

  // 直徑：容許 ±2mm 公差，避免 198 vs 200 誤判
  push('diameter_mm', '球機直徑(mm)', input.diameter_mm, spec.drone_diameter_mm, (i, l) => Math.abs(Number(i) - Number(l)) <= 2);
  // 重量：以上限比對
  push('weight_g', '球機重量(g)', input.weight_g, spec.drone_weight_g_max, (i, l) => Number(i) <= Number(l));
  push('motor_type', '馬達類型', input.motor_type, spec.motor_type, (i, l) => String(i).toLowerCase() === String(l).toLowerCase());
  // 電池：以電芯數比對（規則值視為上限），無法解析時退回字串比對
  push('battery_cells', '電池電芯數', input.battery_cells, spec.battery_cells, (i, l) => {
    const ic = parseCells(i), lc = parseCells(l);
    if (ic === null || lc === null) return String(i).toLowerCase() === String(l).toLowerCase();
    return ic <= lc;
  });

  // 只有規則實際定義了限制的欄位才納入結論；not_applicable 不影響 overall
  const comparable = fields.filter((f) => f.status !== 'not_applicable');
  const anyFail = comparable.some((f) => f.status === 'fail');
  const anyUnknown = comparable.some((f) => f.status === 'unknown');
  const anyPass = comparable.some((f) => f.status === 'pass');
  const overall = anyFail ? 'non_compliant' : anyUnknown ? 'partial' : anyPass ? 'compliant' : 'unknown';
  // 本規則提供幾項可比對欄位（有定義限制者），供結論頁提醒判定基礎的廣度
  const comparableCount = comparable.length;
  return { overall, fields, comparableCount };
}
