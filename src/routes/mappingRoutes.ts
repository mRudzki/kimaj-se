import { Hono } from "hono";
import type { AppConfig, MappingEntry, MappingStore } from "../shared/types";

export interface MappingDeps {
  loadMapping: () => Promise<MappingStore>;
  saveMappingEntry: (projectKey: string, entry: MappingEntry) => Promise<MappingStore>;
  loadConfig: () => Promise<AppConfig | null>;
  fetchKimaiProjects: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
  fetchKimaiActivities: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
}

export function createMappingRoutes(deps: MappingDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await deps.loadMapping()));

  routes.post("/", async (c) => {
    const { projectKey, entry } = await c.req.json<{ projectKey: string; entry: MappingEntry }>();
    const mapping = await deps.saveMappingEntry(projectKey, entry);
    return c.json(mapping);
  });

  routes.get("/kimai-options", async (c) => {
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);
    const [projects, activities] = await Promise.all([
      deps.fetchKimaiProjects(config.kimai),
      deps.fetchKimaiActivities(config.kimai),
    ]);
    return c.json({ projects, activities });
  });

  return routes;
}
