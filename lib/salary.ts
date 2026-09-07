export type SalaryRule = {
  name: string;
  attendance_status: "late" | "half_day" | "absent";
  qualifying_days: number;
  deduction_days: number;
  is_enabled: boolean;
};

export const DEFAULT_SALARY_RULES: SalaryRule[] = [
  {
    name: "Late arrival",
    attendance_status: "late",
    qualifying_days: 3,
    deduction_days: 1,
    is_enabled: true,
  },
  {
    name: "Half day",
    attendance_status: "half_day",
    qualifying_days: 3,
    deduction_days: 1,
    is_enabled: true,
  },
  {
    name: "Absent day",
    attendance_status: "absent",
    qualifying_days: 1,
    deduction_days: 1,
    is_enabled: true,
  },
];

export function normalizeMonthKey(month: string) {
  if (/^\d{4}-\d{2}$/.test(month)) {
    return `${month}-01`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function dateInMonth(date: string, monthKey: string) {
  return date.startsWith(monthKey.slice(0, 7));
}

export function getDaysCutForRule(days: number, rule: SalaryRule) {
  if (!rule.is_enabled || days <= 0) return 0;
  return Math.floor(days / rule.qualifying_days) * rule.deduction_days;
}

export function calculateMonthlySalary({
  baseSalary,
  lateDays,
  absentDays,
  halfDays,
  lateDeductionEnabled,
  rules = DEFAULT_SALARY_RULES,
}: {
  baseSalary: number;
  lateDays: number;
  absentDays: number;
  halfDays: number;
  lateDeductionEnabled: boolean;
  rules?: SalaryRule[];
}) {
  const dailyRate = baseSalary / 30;
  const lateRule = rules.find((rule) => rule.attendance_status === "late") ?? DEFAULT_SALARY_RULES[0];
  const halfRule = rules.find((rule) => rule.attendance_status === "half_day") ?? DEFAULT_SALARY_RULES[1];
  const absentRule = rules.find((rule) => rule.attendance_status === "absent") ?? DEFAULT_SALARY_RULES[2];

  const lateCutDays = lateDeductionEnabled ? getDaysCutForRule(lateDays, lateRule) : 0;
  const halfCutDays = getDaysCutForRule(halfDays, halfRule);
  const absentCutDays = getDaysCutForRule(absentDays, absentRule);

  const deductionDays = lateCutDays + halfCutDays + absentCutDays;
  const deductionAmount = deductionDays * dailyRate;

  return {
    base_salary: baseSalary,
    late_days: lateDays,
    absent_days: absentDays,
    half_days: halfDays,
    late_deduction_enabled: lateDeductionEnabled,
    deduction_days: deductionDays,
    deduction_amount: Number(deductionAmount.toFixed(2)),
    net_pay: Number(Math.max(0, baseSalary - deductionAmount).toFixed(2)),
  };
}
