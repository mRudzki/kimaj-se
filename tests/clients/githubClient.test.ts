import { describe, it, expect, afterEach } from "bun:test";
import { testGithubConnection, fetchGithubActivity } from "../../src/clients/githubClient";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const config = { token: "gh-tok" };

describe("githubClient", () => {
  it("testGithubConnection returns true when /user succeeds", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ login: "mRudzki" }), { status: 200 })) as typeof fetch;
    expect(await testGithubConnection(config)).toBe(true);
  });

  it("testGithubConnection returns false on failure", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
    expect(await testGithubConnection(config)).toBe(false);
  });

  it("fetchGithubActivity resolves the username then maps relevant events into ActivityEvent", async () => {
    let call = 0;
    globalThis.fetch = (async (url: string) => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ login: "mRudzki" }), { status: 200 });
      }
      if (call === 2) {
        return new Response(
          JSON.stringify([
            { type: "PushEvent", created_at: "2026-01-10T10:00:00Z", repo: { name: "mRudzki/kimaj-se" } },
            { type: "WatchEvent", created_at: "2026-01-10T09:00:00Z", repo: { name: "mRudzki/kimaj-se" } },
            { type: "PullRequestEvent", created_at: "2026-01-09T08:00:00Z", repo: { name: "mRudzki/other" } },
          ]),
          { status: 200 }
        );
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    const events = await fetchGithubActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));

    expect(events).toEqual([
      { projectKey: "github:mRudzki/kimaj-se", timestamp: "2026-01-10T10:00:00Z", source: "github" },
      { projectKey: "github:mRudzki/other", timestamp: "2026-01-09T08:00:00Z", source: "github" },
    ]);
  });

  it("stops paging once events are older than 'since'", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify({ login: "mRudzki" }), { status: 200 });
      return new Response(
        JSON.stringify([
          { type: "PushEvent", created_at: "2025-01-01T00:00:00Z", repo: { name: "mRudzki/old" } },
        ]),
        { status: 200 }
      );
    }) as typeof fetch;

    const events = await fetchGithubActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));
    expect(events).toEqual([]);
    expect(call).toBe(2); // one call for username, one page of events, then it stopped
  });

  it("stops gracefully instead of throwing when a page beyond the first hits GitHub's undocumented event cap", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify({ login: "mRudzki" }), { status: 200 });
      if (call === 2) {
        return new Response(
          JSON.stringify([
            { type: "PushEvent", created_at: "2026-01-10T10:00:00Z", repo: { name: "mRudzki/a" } },
          ]),
          { status: 200 }
        );
      }
      // Later pages past the ~300-event cap return an error rather than an empty array.
      return new Response("", { status: 422 });
    }) as typeof fetch;

    const events = await fetchGithubActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));
    expect(events).toEqual([
      { projectKey: "github:mRudzki/a", timestamp: "2026-01-10T10:00:00Z", source: "github" },
    ]);
  });

  it("still throws when the very first events page fails (a real connectivity/auth problem)", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify({ login: "mRudzki" }), { status: 200 });
      return new Response("", { status: 500 });
    }) as typeof fetch;

    await expect(
      fetchGithubActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"))
    ).rejects.toThrow();
  });
});
