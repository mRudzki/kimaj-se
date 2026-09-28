import { describe, it, expect } from "bun:test";
import { toLocalDateString, eachLocalDateInMonth } from "../../src/shared/dateUtils";

describe("toLocalDateString", () => {
  it("buckets a late-evening Warsaw timestamp into the correct local day", () => {
    // 2026-01-05T23:30:00Z is 2026-01-06T00:30 in Europe/Warsaw (UTC+1 in January)
    expect(toLocalDateString("2026-01-05T23:30:00Z")).toBe("2026-01-06");
  });

  it("keeps a mid-day timestamp on the same day", () => {
    expect(toLocalDateString("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });
});

describe("eachLocalDateInMonth", () => {
  it("returns every calendar day for a 28-day February", () => {
    const dates = eachLocalDateInMonth("2026-02");
    expect(dates.length).toBe(28);
    expect(dates[0]).toBe("2026-02-01");
    expect(dates[27]).toBe("2026-02-28");
  });

  it("returns every calendar day for a 31-day month", () => {
    const dates = eachLocalDateInMonth("2026-01");
    expect(dates.length).toBe(31);
    expect(dates[30]).toBe("2026-01-31");
  });
});
