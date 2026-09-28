import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createSettingsRoutes } from "../../src/routes/settingsRoutes";
import type { AppConfig } from "../../src/shared/types";

const sampleConfig: AppConfig = {
  kimai: { baseUrl: "https://k.test", token: "kt" },
  github: { token: "gt" },
  jira: { baseUrl: "https://j.test", email: "a@b.com", token: "jt" },
};

function buildApp(overrides: Partial<Parameters<typeof createSettingsRoutes>[0]> = {}) {
  const app = new Hono();
  app.route(
    "/api/settings",
    createSettingsRoutes({
      loadConfig: async () => null,
      saveConfig: async () => {},
      testKimaiConnection: async () => true,
      testGithubConnection: async () => true,
      testJiraConnection: async () => true,
      ...overrides,
    })
  );
  return app;
}

describe("settings routes", () => {
  it("GET / returns null when no config is stored", async () => {
    const app = buildApp();
    const res = await app.request("/api/settings");
    expect(await res.json()).toBeNull();
  });

  it("GET / returns the stored config", async () => {
    const app = buildApp({ loadConfig: async () => sampleConfig });
    const res = await app.request("/api/settings");
    expect(await res.json()).toEqual(sampleConfig);
  });

  it("POST / saves the config and echoes ok", async () => {
    let saved: AppConfig | undefined;
    const app = buildApp({ saveConfig: async (c) => { saved = c; } });
    const res = await app.request("/api/settings", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(saved).toEqual(sampleConfig);
  });

  it("POST /test reports each connection's status independently", async () => {
    const app = buildApp({ testGithubConnection: async () => false });
    const res = await app.request("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    expect(await res.json()).toEqual({ kimai: true, github: false, jira: true });
  });
});
