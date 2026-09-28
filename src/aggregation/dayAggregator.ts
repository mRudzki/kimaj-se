import type { ActivityEvent, DayBlock } from "../shared/types";

const MIN_WEIGHT_MS = 15 * 60 * 1000; // floor so a single-event project still gets a share
const HALF_HOUR_MS = 30 * 60 * 1000;
const TOTAL_HOURS = 8;
const STEP_HOURS = 0.5;
const TOTAL_UNITS = TOTAL_HOURS / STEP_HOURS; // 16 half-hour units to allocate

function floorToHalfHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
}

/**
 * Largest-remainder allocation of TOTAL_UNITS half-hour units across weighted
 * groups. Every group gets at least one unit (when there are few enough groups
 * for that to be possible) and the units always sum to exactly TOTAL_UNITS —
 * unlike naive per-group rounding, which can round a small legitimate share
 * down to zero or leave the total off by a step after a floor-clamped fixup.
 */
function allocateUnits(weights: number[]): number[] {
  const n = weights.length;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const minUnits = n <= TOTAL_UNITS ? 1 : 0;

  const rawUnits = weights.map((w) => (w / totalWeight) * TOTAL_UNITS);
  const units = rawUnits.map((u) => Math.max(minUnits, Math.floor(u)));

  let remainder = TOTAL_UNITS - units.reduce((sum, u) => sum + u, 0);

  if (remainder > 0) {
    const byFracDesc = rawUnits
      .map((u, i) => ({ i, frac: u - Math.floor(u) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of byFracDesc) {
      if (remainder <= 0) break;
      units[i] += 1;
      remainder -= 1;
    }
  } else if (remainder < 0) {
    const byFracAsc = rawUnits
      .map((u, i) => ({ i, frac: u - Math.floor(u) }))
      .sort((a, b) => a.frac - b.frac);
    for (const { i } of byFracAsc) {
      if (remainder >= 0) break;
      if (units[i] > minUnits) {
        units[i] -= 1;
        remainder += 1;
      }
    }
  }

  return units;
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

  const units = allocateUnits(groups.map((g) => g.weightMs));
  const hoursByProject = units.map((u) => u * STEP_HOURS);

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
