import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createMappingRoutes } from "../../src/routes/mappingRoutes";
import type { AppConfig } from "../../src/shared/types";

const sampleConfig: AppConfig = {
  kimai: { baseUrl: "https://k.test", token: "kt" },
  github: { token: "gt" },
  jira: { baseUrl: "https://j.test", email: "a@b.com", token: "jt" },
};

function buildApp(overrides: Partial<Parameters<typeof createMappingRoutes>[0]> = {}) {
  const app = new Hono();
  app.route(
    "/api/mapping",
    createMappingRoutes({
      loadMapping: async () => ({}),
      saveMappingEntry: async (_k, entry) => ({ "github:a/b": entry }),
      loadConfig: async () => sampleConfig,
      fetchKimaiProjects: async () => [{ id: 1, name: "P1" }],
      fetchKimaiActivities: async () => [{ id: 2, name: "A1" }],
      ...overrides,
    })
  );
  return app;
}

describe("mapping routes", () => {
  it("GET / returns the current mapping store", async () => {
    const app = buildApp({ loadMapping: async () => ({ "jira:PROJ": { kimaiProjectId: 1, kimaiActivityId: 2 } }) });
    const res = await app.request("/api/mapping");
    expect(await res.json()).toEqual({ "jira:PROJ": { kimaiProjectId: 1, kimaiActivityId: 2 } });
  });

  it("POST / saves a mapping entry and returns the updated store", async () => {
    const app = buildApp();
    const res = await app.request("/api/mapping", {
      method: "POST",
      body: JSON.stringify({ projectKey: "github:a/b", entry: { kimaiProjectId: 1, kimaiActivityId: 2 } }),
      headers: { "Content-Type": "application/json" },
    });
    expect(await res.json()).toEqual({ "github:a/b": { kimaiProjectId: 1, kimaiActivityId: 2 } });
  });

  it("GET /kimai-options returns projects and activities", async () => {
    const app = buildApp();
    const res = await app.request("/api/mapping/kimai-options");
    expect(await res.json()).toEqual({ projects: [{ id: 1, name: "P1" }], activities: [{ id: 2, name: "A1" }] });
  });

  it("GET /kimai-options returns 400 when unconfigured", async () => {
    const app = buildApp({ loadConfig: async () => null });
    const res = await app.request("/api/mapping/kimai-options");
    expect(res.status).toBe(400);
  });
});
