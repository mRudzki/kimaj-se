import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createGenerateRoutes } from "../../src/routes/generateRoutes";
import type { AppConfig, MappingStore } from "../../src/shared/types";

const sampleConfig: AppConfig = {
  kimai: { baseUrl: "https://k.test", token: "kt" },
  github: { token: "gt" },
  jira: { baseUrl: "https://j.test", email: "a@b.com", token: "jt" },
};

function buildApp(overrides: Partial<Parameters<typeof createGenerateRoutes>[0]> = {}) {
  const app = new Hono();
  app.route(
    "/api/generate",
    createGenerateRoutes({
      loadConfig: async () => sampleConfig,
      loadMapping: async () => ({} as MappingStore),
      fetchGithubActivity: async () => [],
      fetchJiraActivity: async () => [],
      fetchKimaiTimesheets: async () => [],
      ...overrides,
    })
  );
  return app;
}

async function post(app: Hono, month: string) {
  const res = await app.request("/api/generate", {
    method: "POST",
    body: JSON.stringify({ month }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

describe("generate route", () => {
  it("returns a manual row for every day when there is no activity at all", async () => {
    const summary = await post(buildApp(), "2026-02");
    expect(summary.rows.length).toBe(28);
    expect(summary.rows.every((r: any) => r.status === "manual" && r.hours === 0)).toBe(true);
    expect(summary.missingMappings).toEqual([]);
  });

  it("skips a day that already has an existing Kimai entry, even a partial one", async () => {
    const summary = await post(
      buildApp({
        fetchGithubActivity: async () => [
          { projectKey: "github:a/b", timestamp: "2026-02-05T08:00:00Z", source: "github" },
        ],
        fetchKimaiTimesheets: async () => [
          { id: 1, begin: "2026-02-05T08:00:00Z", end: "2026-02-05T10:00:00Z", project: 1, activity: 1 },
        ],
      }),
      "2026-02"
    );
    const feb5Rows = summary.rows.filter((r: any) => r.date === "2026-02-05");
    expect(feb5Rows.length).toBe(0);
  });

  it("buckets late-evening Warsaw activity into the correct local day", async () => {
    const summary = await post(
      buildApp({
        fetchGithubActivity: async () => [
          // 23:30 UTC on the 4th is 00:30 local on the 5th in January-equivalent offset; use a January month for +1h clarity
          { projectKey: "github:a/b", timestamp: "2026-01-04T23:30:00Z", source: "github" },
        ],
      }),
      "2026-01"
    );
    const jan5Rows = summary.rows.filter((r: any) => r.date === "2026-01-05" && r.status === "auto");
    const jan4Rows = summary.rows.filter((r: any) => r.date === "2026-01-04" && r.status === "auto");
    expect(jan5Rows.length).toBe(1);
    expect(jan4Rows.length).toBe(0);
  });

  it("lists a projectKey in missingMappings when no mapping entry exists for it", async () => {
    const summary = await post(
      buildApp({
        fetchGithubActivity: async () => [
          { projectKey: "github:a/b", timestamp: "2026-02-05T08:00:00Z", source: "github" },
        ],
      }),
      "2026-02"
    );
    expect(summary.missingMappings).toEqual(["github:a/b"]);
  });
});
