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

  it("computes end from begin + the row's current hours, ignoring a stale endIso", async () => {
    let seenEntry: any;
    const app = buildApp({
      createKimaiTimesheet: async (_c, entry) => {
        seenEntry = entry;
        return { id: 1, begin: entry.begin, end: entry.end, project: 1, activity: 1 };
      },
    });
    // begin/end were generated for 8h, but the user edited hours down to 2 in the UI
    // without the stale endIso being updated.
    await post(app, [row({ beginIso: "2026-02-05T08:00:00.000Z", endIso: "2026-02-05T16:00:00.000Z", hours: 2 })]);
    expect(seenEntry.begin).toBe("2026-02-05T08:00:00.000Z");
    expect(seenEntry.end).toBe("2026-02-05T10:00:00.000Z");
  });

  it("gives a manual row (no beginIso) a default 09:00 local start time and submits it", async () => {
    let seenEntry: any;
    const app = buildApp({
      createKimaiTimesheet: async (_c, entry) => {
        seenEntry = entry;
        return { id: 1, begin: entry.begin, end: entry.end, project: 1, activity: 1 };
      },
    });
    const { results } = await post(app, [
      row({ date: "2026-01-05", beginIso: null, endIso: null, hours: 3, status: "manual" }),
    ]);
    expect(results).toEqual([{ date: "2026-01-05", projectKey: "github:a/b", success: true }]);
    // 2026-01-05 09:00 Europe/Warsaw (UTC+1 in January) is 08:00 UTC.
    expect(seenEntry.begin).toBe("2026-01-05T08:00:00.000Z");
    expect(seenEntry.end).toBe("2026-01-05T11:00:00.000Z");
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
