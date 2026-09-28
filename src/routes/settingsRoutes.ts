import { Hono } from "hono";
import type { AppConfig } from "../shared/types";

export interface SettingsDeps {
  loadConfig: () => Promise<AppConfig | null>;
  saveConfig: (config: AppConfig) => Promise<void>;
  testKimaiConnection: (c: AppConfig["kimai"]) => Promise<boolean>;
  testGithubConnection: (c: AppConfig["github"]) => Promise<boolean>;
  testJiraConnection: (c: AppConfig["jira"]) => Promise<boolean>;
}

export function createSettingsRoutes(deps: SettingsDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await deps.loadConfig()));

  routes.post("/", async (c) => {
    const config = await c.req.json<AppConfig>();
    await deps.saveConfig(config);
    return c.json({ ok: true });
  });

  routes.post("/test", async (c) => {
    const config = await c.req.json<AppConfig>();
    const [kimai, github, jira] = await Promise.all([
      deps.testKimaiConnection(config.kimai),
      deps.testGithubConnection(config.github),
      deps.testJiraConnection(config.jira),
    ]);
    return c.json({ kimai, github, jira });
  });

  return routes;
}
