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
      fetchGithubTokenScopes: async () => ["repo", "read:user"],
      testJiraConnection: async () => true,
      testFigmaConnection: async () => true,
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
    expect(await res.json()).toEqual({ kimai: true, github: false, githubWarning: null, jira: true });
  });

  it("POST /test warns when the GitHub token lacks the repo scope", async () => {
    const app = buildApp({ fetchGithubTokenScopes: async () => ["read:user"] });
    const res = await app.request("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    expect(body.githubWarning).toContain("repo");
  });

  it("POST /test does not warn when the token has the repo scope", async () => {
    const app = buildApp({ fetchGithubTokenScopes: async () => ["repo", "read:user"] });
    const res = await app.request("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    expect(body.githubWarning).toBeNull();
  });

  it("POST /test does not warn when scopes can't be determined (e.g. fine-grained tokens)", async () => {
    const app = buildApp({ fetchGithubTokenScopes: async () => [] });
    const res = await app.request("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    expect(body.githubWarning).toBeNull();
  });

  it("POST /test skips the scope check entirely when the connection itself failed", async () => {
    let scopeCalls = 0;
    const app = buildApp({
      testGithubConnection: async () => false,
      fetchGithubTokenScopes: async () => {
        scopeCalls++;
        return ["repo"];
      },
    });
    await app.request("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(sampleConfig),
      headers: { "Content-Type": "application/json" },
    });
    expect(scopeCalls).toBe(0);
  });

  it("POST /test includes the Figma status only when a Figma token is configured", async () => {
    const withFigma = { ...sampleConfig, figma: { token: "ft", teamIds: ["t1"] } };
    const post = (app: ReturnType<typeof buildApp>, body: AppConfig) =>
      app.request("/api/settings/test", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });

    const ok = await (await post(buildApp(), withFigma)).json();
    expect(ok.figma).toBe(true);

    const bad = await (await post(buildApp({ testFigmaConnection: async () => false }), withFigma)).json();
    expect(bad.figma).toBe(false);

    const without = await (await post(buildApp(), sampleConfig)).json();
    expect("figma" in without).toBe(false);

    const emptyToken = await (await post(buildApp(), { ...sampleConfig, figma: { token: "", teamIds: [] } })).json();
    expect("figma" in emptyToken).toBe(false);
  });
});
