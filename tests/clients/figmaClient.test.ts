import { describe, it, expect, afterEach } from "bun:test";
import { testFigmaConnection, fetchFigmaActivity } from "../../src/clients/figmaClient";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const config = { token: "ft", teamIds: ["team1"] };
const since = new Date("2026-01-01T00:00:00Z");
const until = new Date("2026-01-31T23:59:59Z");

/** Serves canned JSON by "pathname+search"; anything else is a 404 (so an unexpected request fails the test). */
function mockFigma(routes: Record<string, unknown>, seen: { url: string; token: string | null }[] = []) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    seen.push({ url: `${u.origin}${u.pathname}${u.search}`, token: new Headers(init?.headers).get("X-Figma-Token") });
    const body = routes[u.pathname + u.search];
    if (body === undefined) return new Response("", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return seen;
}

const baseRoutes = {
  "/v1/me": { id: "me-1" },
  "/v1/teams/team1/projects": { projects: [{ id: "p1", name: "Acme" }] },
};

describe("figmaClient", () => {
  it("testFigmaConnection is true when /v1/me succeeds and false otherwise", async () => {
    mockFigma({ "/v1/me": { id: "me-1" } });
    expect(await testFigmaConnection(config)).toBe(true);
    mockFigma({});
    expect(await testFigmaConnection(config)).toBe(false);
  });

  it("collects the user's versions and comments in range, sends the token, and skips files not modified in range", async () => {
    const seen = mockFigma({
      ...baseRoutes,
      "/v1/projects/p1/files": {
        files: [
          { key: "abc", name: "Checkout PROJ-1", last_modified: "2026-01-20T10:00:00Z" },
          { key: "old", name: "Old file", last_modified: "2025-06-01T10:00:00Z" },
        ],
      },
      "/v1/files/abc/versions": {
        versions: [
          { id: "v3", created_at: "2026-01-21T09:00:00Z", label: null, description: null, user: { id: "me-1" } },
          { id: "v2", created_at: "2026-01-15T09:00:00Z", label: "Ready", description: "PROJ-2 handoff", user: { id: "me-1" } },
          { id: "v1x", created_at: "2026-01-14T09:00:00Z", label: null, description: null, user: { id: "someone-else" } },
          { id: "v0", created_at: "2025-12-15T09:00:00Z", label: null, description: null, user: { id: "me-1" } },
        ],
      },
      "/v1/files/abc/comments": {
        comments: [
          { id: "c1", message: "Looks good", created_at: "2026-01-16T09:00:00Z", user: { id: "me-1" } },
          { id: "c2", message: "Not mine", created_at: "2026-01-16T10:00:00Z", user: { id: "someone-else" } },
        ],
      },
    });

    const events = await fetchFigmaActivity(config, since, until);

    expect(events.map((e) => e.timestamp)).toEqual([
      "2026-01-15T09:00:00Z",
      "2026-01-16T09:00:00Z",
      "2026-01-21T09:00:00Z",
    ]);
    for (const e of events) {
      expect(e.projectKey).toBe("figma:file:abc");
      expect(e.source).toBe("figma");
      expect(e.label).toBe("Checkout PROJ-1");
      expect(e.meta?.folderName).toBe("Acme");
      expect(e.meta?.fileName).toBe("Checkout PROJ-1");
    }
    expect(events[0].meta?.texts).toEqual(["Checkout PROJ-1", "Ready", "PROJ-2 handoff"]);
    expect(events[1].meta?.texts).toEqual(["Checkout PROJ-1", "Looks good"]);
    expect(events[2].meta?.texts).toEqual(["Checkout PROJ-1"]); // null label/description are dropped
    expect(seen.every((s) => s.token === "ft")).toBe(true);
    expect(seen.some((s) => s.url.includes("/old/"))).toBe(false);
  });

  it("follows versions pagination and stops once a whole page is older than the range", async () => {
    const seen = mockFigma({
      ...baseRoutes,
      "/v1/projects/p1/files": { files: [{ key: "abc", name: "F", last_modified: "2026-01-20T10:00:00Z" }] },
      "/v1/files/abc/versions": {
        versions: [{ id: "a", created_at: "2026-01-20T09:00:00Z", label: null, description: null, user: { id: "me-1" } }],
        pagination: { next_page: "https://api.figma.com/v1/files/abc/versions?page_size=30&before=a" },
      },
      "/v1/files/abc/versions?page_size=30&before=a": {
        versions: [{ id: "b", created_at: "2025-11-01T09:00:00Z", label: null, description: null, user: { id: "me-1" } }],
        pagination: { next_page: "https://api.figma.com/v1/files/abc/versions?page_size=30&before=b" },
      },
      "/v1/files/abc/comments": { comments: [] },
    });

    const events = await fetchFigmaActivity(config, since, until);

    expect(events.map((e) => e.timestamp)).toEqual(["2026-01-20T09:00:00Z"]);
    expect(seen.some((s) => s.url.endsWith("before=b"))).toBe(false); // page 2 was entirely too old
  });

  it("never sends the token to a next_page URL on another host", async () => {
    const seen = mockFigma({
      ...baseRoutes,
      "/v1/projects/p1/files": { files: [{ key: "abc", name: "F", last_modified: "2026-01-20T10:00:00Z" }] },
      "/v1/files/abc/versions": {
        versions: [{ id: "a", created_at: "2026-01-20T09:00:00Z", label: null, description: null, user: { id: "me-1" } }],
        pagination: { next_page: "https://evil.example.com/steal" },
      },
      "/v1/files/abc/comments": { comments: [] },
    });

    await expect(fetchFigmaActivity(config, since, until)).rejects.toThrow();
    expect(seen.some((s) => s.url.startsWith("https://evil.example.com"))).toBe(false);
  });

  it("throws when Figma answers with an error status", async () => {
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    await expect(fetchFigmaActivity(config, since, until)).rejects.toThrow("429");
  });
});
