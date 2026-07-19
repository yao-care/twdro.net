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
    if (noInput && noLimit) return; // 規則未定義且使用者未填 → 不列入比對欄位
    let status: Status;
    if (inVal === undefined || inVal === null || inVal === '') status = 'unknown';
    else if (limit === undefined || limit === null) status = 'unknown';
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
