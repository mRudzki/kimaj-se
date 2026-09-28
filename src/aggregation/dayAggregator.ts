import type { ActivityEvent, DayBlock } from "../shared/types";

const MIN_WEIGHT_MS = 15 * 60 * 1000; // floor so a single-event project still gets a share
const HALF_HOUR_MS = 30 * 60 * 1000;
const TOTAL_HOURS = 8;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function floorToHalfHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
}

export function aggregateDay(events: ActivityEvent[]): DayBlock[] {
  if (events.length === 0) return [];

  const byProject = new Map<string, ActivityEvent[]>();
  for (const evt of events) {
    const list = byProject.get(evt.projectKey) ?? [];
    list.push(evt);
    byProject.set(evt.projectKey, list);
  }

  type Group = { projectKey: string; firstMs: number; weightMs: number };
  const groups: Group[] = [...byProject.entries()].map(([projectKey, evts]) => {
    const timestamps = evts.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
    const span = timestamps[timestamps.length - 1] - timestamps[0];
    return { projectKey, firstMs: timestamps[0], weightMs: Math.max(span, MIN_WEIGHT_MS) };
  });
  groups.sort((a, b) => a.firstMs - b.firstMs);

  const totalWeight = groups.reduce((sum, g) => sum + g.weightMs, 0);
  const hoursByProject = groups.map((g) => roundToHalf(TOTAL_HOURS * (g.weightMs / totalWeight)));

  const roundedTotal = hoursByProject.reduce((sum, h) => sum + h, 0);
  const diff = roundToHalf(TOTAL_HOURS - roundedTotal);
  if (diff !== 0) {
    const largestIndex = groups.reduce(
      (best, g, i) => (g.weightMs > groups[best].weightMs ? i : best),
      0
    );
    hoursByProject[largestIndex] = Math.max(0.5, hoursByProject[largestIndex] + diff);
  }

  const dayStart = floorToHalfHour(new Date(Math.min(...groups.map((g) => g.firstMs))));
  const blocks: DayBlock[] = [];
  let cursor = dayStart;
  for (let i = 0; i < groups.length; i++) {
    const hours = hoursByProject[i];
    const end = new Date(cursor.getTime() + hours * 3600 * 1000);
    blocks.push({
      projectKey: groups[i].projectKey,
      beginIso: cursor.toISOString(),
      endIso: end.toISOString(),
      hours,
    });
    cursor = end;
  }
  return blocks;
}
