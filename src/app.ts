import { Hono } from "hono";
import { createSettingsRoutes } from "./routes/settingsRoutes";
import { loadConfig, saveConfig } from "./config";
import { testKimaiConnection } from "./clients/kimaiClient";
import { testGithubConnection } from "./clients/githubClient";
import { testJiraConnection } from "./clients/jiraClient";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route(
    "/api/settings",
    createSettingsRoutes({ loadConfig, saveConfig, testKimaiConnection, testGithubConnection, testJiraConnection })
  );
  return app;
}
