import type { SummaryRow } from "@shared/types";

// A single day can produce multiple rows (one per project touched that day),
// so the number of working days is the count of *distinct* dates, not rows.length.
export function countWorkingDays(rows: SummaryRow[]): number {
  return new Set(rows.map((r) => r.date)).size;
}
