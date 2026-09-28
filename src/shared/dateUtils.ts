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

export function eachLocalDateInMonth(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}
