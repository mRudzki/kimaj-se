import { Hono } from "hono";
import type { AppConfig, SubmitResult, SummaryRow } from "../shared/types";

export interface SubmitDeps {
  loadConfig: () => Promise<AppConfig | null>;
  createKimaiTimesheet: (
    c: AppConfig["kimai"],
    entry: { begin: string; end: string; project: number; activity: number; description: string }
  ) => Promise<unknown>;
}

export function createSubmitRoutes(deps: SubmitDeps) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const { rows } = await c.req.json<{ rows: SummaryRow[] }>();
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);

    const results: SubmitResult[] = [];
    for (const row of rows) {
      if (row.hours <= 0) continue;
      if (!row.kimaiProjectId || !row.kimaiActivityId || !row.beginIso || !row.endIso) {
        results.push({ date: row.date, projectKey: row.projectKey, success: false, error: "missing_mapping_or_time" });
        continue;
      }
      try {
        await deps.createKimaiTimesheet(config.kimai, {
          begin: row.beginIso,
          end: row.endIso,
          project: row.kimaiProjectId,
          activity: row.kimaiActivityId,
          description: row.description,
        });
        results.push({ date: row.date, projectKey: row.projectKey, success: true });
      } catch (err) {
        results.push({ date: row.date, projectKey: row.projectKey, success: false, error: (err as Error).message });
      }
    }
    return c.json({ results });
  });

  return routes;
}
