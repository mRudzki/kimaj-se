import { describe, it, expect } from "bun:test";
import {
  toLocalDateString,
  eachLocalDateInMonth,
  localDateTimeToIso,
  toLocalDateTimeString,
  isWeekend,
} from "../../src/shared/dateUtils";

describe("toLocalDateString", () => {
  it("buckets a late-evening Warsaw timestamp into the correct local day", () => {
    // 2026-01-05T23:30:00Z is 2026-01-06T00:30 in Europe/Warsaw (UTC+1 in January)
    expect(toLocalDateString("2026-01-05T23:30:00Z")).toBe("2026-01-06");
  });

  it("keeps a mid-day timestamp on the same day", () => {
    expect(toLocalDateString("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });
});

describe("localDateTimeToIso", () => {
  it("converts a Warsaw wall-clock time in winter (UTC+1) to the correct UTC instant", () => {
    expect(localDateTimeToIso("2026-01-05", 9, 0)).toBe("2026-01-05T08:00:00.000Z");
  });

  it("converts a Warsaw wall-clock time in summer (UTC+2) to the correct UTC instant", () => {
    expect(localDateTimeToIso("2026-07-05", 9, 0)).toBe("2026-07-05T07:00:00.000Z");
  });

  it("round-trips back to the same local date via toLocalDateString", () => {
    const iso = localDateTimeToIso("2026-01-05", 9, 0);
    expect(toLocalDateString(iso)).toBe("2026-01-05");
  });
});

describe("toLocalDateTimeString", () => {
  it("formats a UTC instant as a naive Warsaw wall-clock string in winter (UTC+1)", () => {
    // Kimai's API rejects a trailing Z/offset and interprets a naive string as
    // the user's own Kimai timezone, so this must be a plain "no zone" string.
    expect(toLocalDateTimeString("2026-01-05T08:00:00.000Z")).toBe("2026-01-05T09:00:00");
  });

  it("formats a UTC instant as a naive Warsaw wall-clock string in summer (UTC+2)", () => {
    expect(toLocalDateTimeString("2026-07-05T07:00:00.000Z")).toBe("2026-07-05T09:00:00");
  });

  it("round-trips with localDateTimeToIso", () => {
    const iso = localDateTimeToIso("2026-03-10", 14, 30);
    expect(toLocalDateTimeString(iso)).toBe("2026-03-10T14:30:00");
  });
});

describe("isWeekend", () => {
  it("treats Saturday as a weekend", () => {
    expect(isWeekend("2026-01-03")).toBe(true);
  });

  it("treats Sunday as a weekend", () => {
    expect(isWeekend("2026-01-04")).toBe(true);
  });

  it("treats Monday as not a weekend", () => {
    expect(isWeekend("2026-01-05")).toBe(false);
  });

  it("treats Friday as not a weekend", () => {
    expect(isWeekend("2026-01-02")).toBe(false);
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
