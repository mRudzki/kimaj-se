export function toLocalDateString(isoTimestamp: string, timeZone = "Europe/Warsaw"): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // en-CA formats as YYYY-MM-DD
}

export function localDateTimeToIso(dateStr: string, hour: number, minute: number, timeZone = "Europe/Warsaw"): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Provisional instant: treat the desired wall-clock time as if it were UTC.
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Ask what wall-clock time that instant actually is in the target zone,
  // then use the difference to correct the guess (handles DST correctly).
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(guessUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asLocalMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = asLocalMs - guessUtcMs;

  return new Date(guessUtcMs - offsetMs).toISOString();
}

export function eachLocalDateInMonth(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}
