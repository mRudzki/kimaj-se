import { describe, it, expect } from "bun:test";
import { countWorkingDays } from "../../web/src/summaryHours";
import type { SummaryRow } from "../../src/shared/types";

function row(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    date: "2026-09-01",
    projectKey: "github:a/b",
    kimaiProjectId: 1,
    kimaiActivityId: 2,
    beginIso: "2026-09-01T08:00:00.000Z",
    endIso: "2026-09-01T16:00:00.000Z",
    hours: 8,
    description: "github:a/b",
    status: "auto",
    ...overrides,
  };
}

describe("countWorkingDays", () => {
  it("counts each row as one day when there is exactly one row per day", () => {
    const rows = [row({ date: "2026-09-01" }), row({ date: "2026-09-02" }), row({ date: "2026-09-03" })];
    expect(countWorkingDays(rows)).toBe(3);
  });

  it("counts a day with multiple project rows only once", () => {
    // A single day split across 3 projects produces 3 rows for the same date.
    const rows = [
      row({ date: "2026-09-01", projectKey: "github:a", hours: 4 }),
      row({ date: "2026-09-01", projectKey: "github:b", hours: 2.5 }),
      row({ date: "2026-09-01", projectKey: "github:c", hours: 1.5 }),
      row({ date: "2026-09-02" }),
    ];
    expect(countWorkingDays(rows)).toBe(2);
  });

  it("returns 0 for an empty summary", () => {
    expect(countWorkingDays([])).toBe(0);
  });
});
