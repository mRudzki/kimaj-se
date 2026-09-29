import { Hono } from "hono";
import type { ActivityEvent, AppConfig, MappingEntry, MappingStore, MonthlySummary, SummaryRow } from "../shared/types";
import { aggregateDay } from "../aggregation/dayAggregator";
import { toLocalDateString, eachLocalDateInMonth, isWeekend } from "../shared/dateUtils";

export interface GenerateDeps {
  loadConfig: () => Promise<AppConfig | null>;
  loadMapping: () => Promise<MappingStore>;
  fetchGithubActivity: (c: AppConfig["github"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchJiraActivity: (c: AppConfig["jira"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchKimaiTimesheets: (
    c: AppConfig["kimai"],
    since: Date,
    until: Date
  ) => Promise<{ id: number; begin: string; end: string; project: number; activity: number }[]>;
}

const TIMEZONE_BUFFER_MS = 3 * 60 * 60 * 1000; // covers Europe/Warsaw's UTC+1 / UTC+2 offset

function isIgnored(entry: MappingEntry | undefined): boolean {
  return entry !== undefined && "ignored" in entry && entry.ignored === true;
}

function groupByLocalDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const map = new Map<string, ActivityEvent[]>();
  for (const evt of events) {
    const day = toLocalDateString(evt.timestamp);
    const list = map.get(day) ?? [];
    list.push(evt);
    map.set(day, list);
  }
  return map;
}

export function createGenerateRoutes(deps: GenerateDeps) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const { month } = await c.req.json<{ month: string }>();
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);
    const mapping = await deps.loadMapping();

    const [year, monthNum] = month.split("-").map(Number);
    const since = new Date(Date.UTC(year, monthNum - 1, 1) - TIMEZONE_BUFFER_MS);
    const until = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59) + TIMEZONE_BUFFER_MS);

    const [githubEvents, jiraEvents, existingTimesheets] = await Promise.all([
      deps.fetchGithubActivity(config.github, since, until),
      deps.fetchJiraActivity(config.jira, since, until),
      deps.fetchKimaiTimesheets(config.kimai, since, until),
    ]);

    const daysWithExistingEntries = new Set(existingTimesheets.map((t) => toLocalDateString(t.begin)));
    const activeEvents = [...githubEvents, ...jiraEvents].filter((evt) => !isIgnored(mapping[evt.projectKey]));
    const eventsByDay = groupByLocalDay(activeEvents);

    const missingMappings = new Set<string>();
    const rows: SummaryRow[] = [];

    for (const date of eachLocalDateInMonth(month)) {
      if (isWeekend(date)) continue;
      if (daysWithExistingEntries.has(date)) continue;

      const dayEvents = eventsByDay.get(date) ?? [];
      for (const evt of dayEvents) {
        if (!mapping[evt.projectKey]) missingMappings.add(evt.projectKey);
      }

      if (dayEvents.length === 0) {
        rows.push({
          date,
          projectKey: null,
          kimaiProjectId: null,
          kimaiActivityId: null,
          beginIso: null,
          endIso: null,
          hours: 0,
          description: "",
          status: "manual",
        });
        continue;
      }

      for (const block of aggregateDay(dayEvents)) {
        const entry = mapping[block.projectKey];
        const hasKimaiMapping = entry && "kimaiProjectId" in entry;
        rows.push({
          date,
          projectKey: block.projectKey,
          kimaiProjectId: hasKimaiMapping ? entry.kimaiProjectId : null,
          kimaiActivityId: hasKimaiMapping ? entry.kimaiActivityId : null,
          beginIso: block.beginIso,
          endIso: block.endIso,
          hours: block.hours,
          description: block.projectKey,
          status: "auto",
        });
      }
    }

    const summary: MonthlySummary = { month, rows, missingMappings: [...missingMappings] };
    return c.json(summary);
  });

  return routes;
}
