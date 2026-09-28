import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createSubmitRoutes } from "../../src/routes/submitRoutes";
import type { AppConfig, SummaryRow } from "../../src/shared/types";

const sampleConfig: AppConfig = {
  kimai: { baseUrl: "https://k.test", token: "kt" },
  github: { token: "gt" },
  jira: { baseUrl: "https://j.test", email: "a@b.com", token: "jt" },
};

function row(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    date: "2026-02-05",
    projectKey: "github:a/b",
    kimaiProjectId: 1,
    kimaiActivityId: 2,
    beginIso: "2026-02-05T08:00:00.000Z",
    endIso: "2026-02-05T16:00:00.000Z",
    hours: 8,
    description: "github:a/b",
    status: "auto",
    ...overrides,
  };
}

function buildApp(overrides: Partial<Parameters<typeof createSubmitRoutes>[0]> = {}) {
  const app = new Hono();
  app.route(
    "/api/submit",
    createSubmitRoutes({
      loadConfig: async () => sampleConfig,
      createKimaiTimesheet: async () => ({ id: 1, begin: "", end: "", project: 1, activity: 1 }),
      ...overrides,
    })
  );
  return app;
}

async function post(app: Hono, rows: SummaryRow[]) {
  const res = await app.request("/api/submit", {
    method: "POST",
    body: JSON.stringify({ rows }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

describe("submit route", () => {
  it("skips rows with zero hours", async () => {
    let calls = 0;
    const app = buildApp({ createKimaiTimesheet: async () => { calls++; return { id: 1, begin: "", end: "", project: 1, activity: 1 }; } });
    const { results } = await post(app, [row({ hours: 0 })]);
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("reports an error for a row missing its mapping", async () => {
    const app = buildApp();
    const { results } = await post(app, [row({ kimaiProjectId: null })]);
    expect(results).toEqual([
      { date: "2026-02-05", projectKey: "github:a/b", success: false, error: "missing_mapping_or_time" },
    ]);
  });

  it("continues submitting remaining rows when one row's Kimai call fails", async () => {
    let call = 0;
    const app = buildApp({
      createKimaiTimesheet: async () => {
        call++;
        if (call === 1) throw new Error("401 unauthorized");
        return { id: call, begin: "", end: "", project: 1, activity: 1 };
      },
    });
    const { results } = await post(app, [row({ date: "2026-02-05" }), row({ date: "2026-02-06" })]);
    expect(results).toEqual([
      { date: "2026-02-05", projectKey: "github:a/b", success: false, error: "401 unauthorized" },
      { date: "2026-02-06", projectKey: "github:a/b", success: true },
    ]);
  });
});
