import { describe, it, expect, afterEach } from "bun:test";
import {
  testKimaiConnection,
  fetchKimaiProjects,
  fetchKimaiTimesheets,
  createKimaiTimesheet,
} from "../../src/clients/kimaiClient";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const config = { baseUrl: "https://kimai.test", token: "tok" };

describe("kimaiClient", () => {
  it("testKimaiConnection returns true on a 2xx response", async () => {
    globalThis.fetch = (async () => new Response("[]", { status: 200 })) as typeof fetch;
    expect(await testKimaiConnection(config)).toBe(true);
  });

  it("testKimaiConnection returns false on a non-2xx response", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
    expect(await testKimaiConnection(config)).toBe(false);
  });

  it("fetchKimaiProjects sends the bearer token and parses the list", async () => {
    let seenHeaders: Headers | undefined;
    globalThis.fetch = (async (_url, init) => {
      seenHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify([{ id: 1, name: "Kimaj" }]), { status: 200 });
    }) as typeof fetch;
    const projects = await fetchKimaiProjects(config);
    expect(projects).toEqual([{ id: 1, name: "Kimaj" }]);
    expect(seenHeaders?.get("Authorization")).toBe("Bearer tok");
  });

  it("fetchKimaiTimesheets throws on a failed response", async () => {
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    await expect(fetchKimaiTimesheets(config, new Date(), new Date())).rejects.toThrow();
  });

  it("createKimaiTimesheet posts the entry and returns the created record", async () => {
    let seenBody: string | undefined;
    globalThis.fetch = (async (_url, init) => {
      seenBody = init?.body as string;
      return new Response(JSON.stringify({ id: 9, begin: "b", end: "e", project: 1, activity: 2 }), {
        status: 200,
      });
    }) as typeof fetch;
    const result = await createKimaiTimesheet(config, {
      begin: "2026-01-05T08:00:00.000Z",
      end: "2026-01-05T16:00:00.000Z",
      project: 1,
      activity: 2,
      description: "github:a/b",
    });
    expect(result.id).toBe(9);
    expect(JSON.parse(seenBody!).project).toBe(1);
  });
});
