import { describe, it, expect, afterEach } from "bun:test";
import { testJiraConnection, fetchJiraActivity } from "../../src/clients/jiraClient";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const config = { baseUrl: "https://example.atlassian.net", email: "a@b.com", token: "jt" };

describe("jiraClient", () => {
  it("testJiraConnection returns true when /myself succeeds", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ accountId: "acc-1" }), { status: 200 })) as typeof fetch;
    expect(await testJiraConnection(config)).toBe(true);
  });

  it("testJiraConnection returns false on failure", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
    expect(await testJiraConnection(config)).toBe(false);
  });

  it("fetchJiraActivity extracts creation, status changes, and comments by the current user", async () => {
    let call = 0;
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ accountId: "acc-1" }), { status: 200 });
      }
      seenUrl = url;
      return new Response(
        JSON.stringify({
          isLast: true,
          issues: [
            {
              key: "PROJ-42",
              fields: {
                project: { key: "PROJ" },
                created: "2026-01-05T09:00:00.000+0000",
                reporter: { accountId: "acc-1" },
                comment: {
                  comments: [
                    { author: { accountId: "acc-1" }, created: "2026-01-06T10:00:00.000+0000" },
                    { author: { accountId: "acc-2" }, created: "2026-01-06T11:00:00.000+0000" },
                  ],
                },
              },
              changelog: {
                histories: [
                  {
                    author: { accountId: "acc-1" },
                    created: "2026-01-07T12:00:00.000+0000",
                    items: [{ field: "status" }],
                  },
                  {
                    author: { accountId: "acc-1" },
                    created: "2026-01-07T13:00:00.000+0000",
                    items: [{ field: "description" }],
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const events = await fetchJiraActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));

    expect(events).toEqual([
      { projectKey: "jira:PROJ", timestamp: "2026-01-05T09:00:00.000+0000", source: "jira", label: "PROJ-42" },
      { projectKey: "jira:PROJ", timestamp: "2026-01-06T10:00:00.000+0000", source: "jira", label: "PROJ-42" },
      { projectKey: "jira:PROJ", timestamp: "2026-01-07T12:00:00.000+0000", source: "jira", label: "PROJ-42" },
    ]);
    // /rest/api/3/search was removed by Atlassian (410 Gone on a live instance);
    // the current endpoint is /rest/api/3/search/jql.
    expect(seenUrl).toContain("/rest/api/3/search/jql?");
    expect(seenUrl).not.toContain("/rest/api/3/search?");
  });

  it("paginates using nextPageToken until isLast is true (the old total/startAt scheme is gone)", async () => {
    let call = 0;
    const seenUrls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      call++;
      if (call === 1) return new Response(JSON.stringify({ accountId: "acc-1" }), { status: 200 });
      seenUrls.push(url);
      if (call === 2) {
        return new Response(
          JSON.stringify({
            isLast: false,
            nextPageToken: "token-page-2",
            issues: [
              {
                fields: {
                  project: { key: "A" },
                  created: "2026-01-05T09:00:00.000+0000",
                  reporter: { accountId: "acc-1" },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          isLast: true,
          issues: [
            {
              fields: {
                project: { key: "B" },
                created: "2026-01-06T09:00:00.000+0000",
                reporter: { accountId: "acc-1" },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const events = await fetchJiraActivity(config, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));

    expect(events.map((e) => e.projectKey)).toEqual(["jira:A", "jira:B"]);
    expect(call).toBe(3); // myself, page 1, page 2
    expect(seenUrls[1]).toContain("nextPageToken=token-page-2");
  });
});
