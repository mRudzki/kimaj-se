import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { resolveStaticRoot } from "./staticRoot";
import { createSettingsRoutes } from "./routes/settingsRoutes";
import { createMappingRoutes } from "./routes/mappingRoutes";
import { createGenerateRoutes } from "./routes/generateRoutes";
import { createSubmitRoutes } from "./routes/submitRoutes";
import { loadConfig, saveConfig } from "./config";
import { loadMapping, saveMappingEntry } from "./mapping";
import {
  testKimaiConnection,
  fetchKimaiProjects,
  fetchKimaiActivities,
  fetchKimaiTimesheets,
  createKimaiTimesheet,
} from "./clients/kimaiClient";
import { testGithubConnection, fetchGithubActivity } from "./clients/githubClient";
import { testJiraConnection, fetchJiraActivity } from "./clients/jiraClient";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route(
    "/api/settings",
    createSettingsRoutes({ loadConfig, saveConfig, testKimaiConnection, testGithubConnection, testJiraConnection })
  );
  app.route(
    "/api/mapping",
    createMappingRoutes({ loadMapping, saveMappingEntry, loadConfig, fetchKimaiProjects, fetchKimaiActivities })
  );
  app.route(
    "/api/generate",
    createGenerateRoutes({ loadConfig, loadMapping, fetchGithubActivity, fetchJiraActivity, fetchKimaiTimesheets })
  );
  app.route("/api/submit", createSubmitRoutes({ loadConfig, createKimaiTimesheet }));
  const staticRoot = resolveStaticRoot();
  app.use("/*", serveStatic({ root: staticRoot }));
  app.notFound(async (c) => c.html(await Bun.file(`${staticRoot}/index.html`).text()));
  return app;
}
