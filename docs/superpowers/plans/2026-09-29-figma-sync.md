# Figma Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Figma as a third activity source (next to GitHub and Jira) so the user's saved file versions and comments in Figma become rows in the monthly Kimai summary.

**Architecture:** A new `figmaClient` returns `ActivityEvent`s (source `"figma"`, key `figma:file:<fileKey>`, plus a `meta` block with file/folder name and scannable texts). The generate route merges them with GitHub/Jira events after a pure `remapFigmaEvents` step that re-keys an event to `jira:KEY` when a mapped Jira key appears in its texts. Everything downstream (`aggregateDay`, mapping flow, submit) is unchanged; the mapping UI gains readable labels and a suggestion (`suggestMapping`) for new Figma files.

**Tech Stack:** Bun + Hono, React + Vite, TypeScript, native `fetch`, `bun test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-figma-sync-design.md`

## Global Constraints

- Figma Personal Access Token and team ids are stored only in `~/.kimaj-se/config.json` (`figma: { token, teamIds }`), never in the repo. The `figma` config section is optional; without a token and at least one team id, Figma is skipped and Generate behaves exactly as before.
- Only the current user's activity (versions and comments authored by the `/v1/me` user id).
- One Figma **file** = one Kimai project. No per-page matching (the versions API does not say which page changed).
- Mapping key is `figma:file:<fileKey>`; a mapped Jira key found in file name / version label+description / comment message wins and re-keys the event to `jira:KEY` (an `ignored` Jira mapping counts as mapped).
- No separate "sync Figma" button: Figma is fetched inside the existing Generate.
- A Figma failure (bad token, HTTP 429, ...) must not fail Generate: it becomes a `warnings` entry in the summary.
- Out of scope: page-level matching, auto-discovering teams, folder-level mapping keys, syncing back to Figma.
- Backend stack unchanged: Bun + Hono, tests with `bun test`, native `fetch`, no new dependencies. Web code imports shared code through the `@shared` alias (`src/shared`); tests import it by relative path.
- Verification commands: `bun test` for backend/shared/pure-web code; `bun run build:web` for the React pages (there is no `tsc` path alias for `@shared`, so `tsc` is not a usable check).
- End every commit message with the `Co-Authored-By` trailer required by the session's attribution rules.

## Review Focus

- Figma returns an error (401, 429, network) while GitHub/Jira work: Generate must still return rows plus a warning, not a 500. (Task 3 test.)
- Figma token set but `teamIds` empty: no Figma request, no crash, no warning. (Task 3 test.)
- A `next_page` URL in the versions response pointing to a non-Figma host must never receive the token. (Task 2 test.)
- Versions with `label`/`description` = `null` and files with a name containing no Jira key must not crash matching. (Tasks 1 and 2 tests.)
- Saving from the "Mapowania" screen must keep an entry's `label`; otherwise Figma rows go back to showing raw keys after the first edit. (Task 6 test on the pure helper.)

---

## File Structure

- Modify `src/shared/types.ts` — `"figma"` source, `FigmaEventMeta`, `MappingHint`, `label` on `MappingEntry`, `figma` in `AppConfig`, `missingHints`/`warnings` in `MonthlySummary`.
- Create `src/aggregation/figmaMatching.ts` — `findJiraProjectKey`, `remapFigmaEvents` (pure).
- Create `src/clients/figmaClient.ts` — `testFigmaConnection`, `fetchFigmaActivity`.
- Modify `src/routes/generateRoutes.ts` — fetch Figma, remap, hints, warnings.
- Modify `src/routes/settingsRoutes.ts`, `src/app.ts` — Figma connection test and wiring.
- Create `src/shared/suggestMapping.ts` — folder-sibling / name-similarity suggestion (pure).
- Create `web/src/mappingEntry.ts` — `toLocalEntry`, `toMappingEntry` (pure, label-preserving).
- Modify `web/src/api.ts`, `web/src/App.tsx`, `web/src/pages/{SettingsPage,MappingPage,MappingsManagerPage,SummaryPage,HomePage}.tsx`.
- Modify `README.md`.
- Tests: `tests/aggregation/figmaMatching.test.ts`, `tests/clients/figmaClient.test.ts`, `tests/shared/suggestMapping.test.ts`, `tests/web/mappingEntry.test.ts`, plus additions to `tests/routes/generateRoutes.test.ts` and `tests/routes/settingsRoutes.test.ts`.

---

### Task 1: Shared types and Jira-key matching

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/aggregation/figmaMatching.ts`
- Test: `tests/aggregation/figmaMatching.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types (exact): `FigmaEventMeta { fileName: string; folderName: string; texts: string[] }`; `ActivityEvent.source: "github" | "jira" | "figma"` and `ActivityEvent.meta?: FigmaEventMeta`; `MappingHint { label: string; folderName: string; fileName: string }`; `MappingEntry = ({ kimaiProjectId: number; kimaiActivityId: number } | { ignored: true }) & { label?: string }`; `AppConfig.figma?: { token: string; teamIds: string[] }`; `MonthlySummary.missingHints?: Record<string, MappingHint>` and `MonthlySummary.warnings?: string[]`.
  - `findJiraProjectKey(texts: string[], mapping: MappingStore): string | null` — returns `"jira:KEY"` for the first text/key with an entry in `mapping`.
  - `remapFigmaEvents(events: ActivityEvent[], mapping: MappingStore): ActivityEvent[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/aggregation/figmaMatching.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { findJiraProjectKey, remapFigmaEvents } from "../../src/aggregation/figmaMatching";
import type { ActivityEvent, MappingStore } from "../../src/shared/types";

const mapping: MappingStore = {
  "jira:PROJ": { kimaiProjectId: 1, kimaiActivityId: 2 },
  "jira:SECRET": { ignored: true },
};

function figmaEvent(texts: string[]): ActivityEvent {
  return {
    projectKey: "figma:file:abc",
    timestamp: "2026-02-05T08:00:00Z",
    source: "figma",
    label: "Homepage",
    meta: { fileName: "Homepage", folderName: "Acme", texts },
  };
}

describe("findJiraProjectKey", () => {
  it("returns the jira key when it is mapped", () => {
    expect(findJiraProjectKey(["Checkout PROJ-123"], mapping)).toBe("jira:PROJ");
  });

  it("treats an ignored jira mapping as mapped", () => {
    expect(findJiraProjectKey(["SECRET-9 mockups"], mapping)).toBe("jira:SECRET");
  });

  it("returns null when the key has no mapping", () => {
    expect(findJiraProjectKey(["Checkout OTHER-1"], mapping)).toBeNull();
  });

  it("matches a key delimited by underscores and ignores lowercase look-alikes", () => {
    expect(findJiraProjectKey(["checkout_PROJ-7_v2"], mapping)).toBe("jira:PROJ");
    expect(findJiraProjectKey(["proj-7"], mapping)).toBeNull();
  });

  it("skips unmapped keys and returns the first mapped one, in text order", () => {
    expect(findJiraProjectKey(["OTHER-1", "PROJ-2 and SECRET-3"], mapping)).toBe("jira:PROJ");
  });

  it("handles no texts and texts without any key", () => {
    expect(findJiraProjectKey([], mapping)).toBeNull();
    expect(findJiraProjectKey(["Homepage", ""], mapping)).toBeNull();
  });
});

describe("remapFigmaEvents", () => {
  it("re-keys a figma event to the mapped jira project and keeps everything else", () => {
    const [evt] = remapFigmaEvents([figmaEvent(["Homepage", "PROJ-5"])], mapping);
    expect(evt.projectKey).toBe("jira:PROJ");
    expect(evt.label).toBe("Homepage");
    expect(evt.source).toBe("figma");
  });

  it("leaves a figma event without a mapped key on its figma:file key", () => {
    const [evt] = remapFigmaEvents([figmaEvent(["Homepage", "OTHER-5"])], mapping);
    expect(evt.projectKey).toBe("figma:file:abc");
  });

  it("does not touch github/jira events or figma events without meta", () => {
    const gh: ActivityEvent = { projectKey: "github:a/b", timestamp: "2026-02-05T08:00:00Z", source: "github", label: "PROJ-1" };
    const noMeta: ActivityEvent = { projectKey: "figma:file:x", timestamp: "2026-02-05T08:00:00Z", source: "figma" };
    expect(remapFigmaEvents([gh, noMeta], mapping)).toEqual([gh, noMeta]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/aggregation/figmaMatching.test.ts`
Expected: FAIL — cannot find module `../../src/aggregation/figmaMatching`.

- [ ] **Step 3: Write minimal implementation**

Edit `src/shared/types.ts`. Replace the `ActivityEvent` interface with:

```ts
export interface FigmaEventMeta {
  fileName: string;
  folderName: string; // Figma project (folder) the file lives in
  texts: string[]; // file name, version label/description or comment message — scanned for Jira keys
}

export interface ActivityEvent {
  projectKey: string; // "github:owner/repo", "jira:PROJECTKEY" or "figma:file:<fileKey>"
  timestamp: string; // ISO 8601 UTC
  source: "github" | "jira" | "figma";
  label?: string; // Jira issue key, GitHub PR title / branch name, or Figma file name
  meta?: FigmaEventMeta; // only set on Figma events
}
```

Replace `MonthlySummary` with:

```ts
export interface MappingHint {
  label: string; // "<folder> / <file>", shown instead of the raw key
  folderName: string;
  fileName: string;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  rows: SummaryRow[];
  missingMappings: string[]; // projectKeys with no mapping entry
  missingHints?: Record<string, MappingHint>; // readable names for some of the missing keys
  warnings?: string[]; // non-fatal problems, e.g. Figma could not be fetched
}
```

Replace `MappingEntry` and `AppConfig` with:

```ts
export type MappingEntry = ({ kimaiProjectId: number; kimaiActivityId: number } | { ignored: true }) & {
  label?: string; // human-readable name for keys that are not self-explanatory (Figma files)
};

export type MappingStore = Record<string, MappingEntry>;

export interface AppConfig {
  kimai: { baseUrl: string; token: string };
  github: { token: string };
  jira: { baseUrl: string; email: string; token: string };
  figma?: { token: string; teamIds: string[] };
}
```

Create `src/aggregation/figmaMatching.ts`:

```ts
import type { ActivityEvent, MappingStore } from "../shared/types";

// Not preceded/followed by a letter or digit, so "checkout_PROJ-7_v2" matches but "proj-7" does not.
const JIRA_KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+(?![A-Za-z0-9])/g;

/** First `jira:KEY` (in text order) that has an entry in the mapping, ignored entries included. */
export function findJiraProjectKey(texts: string[], mapping: MappingStore): string | null {
  for (const text of texts) {
    for (const match of text.matchAll(JIRA_KEY_RE)) {
      const key = `jira:${match[1]}`;
      if (mapping[key]) return key;
    }
  }
  return null;
}

/** Re-keys Figma events whose texts contain a mapped Jira key so they land in the same Kimai project as the Jira work. */
export function remapFigmaEvents(events: ActivityEvent[], mapping: MappingStore): ActivityEvent[] {
  return events.map((evt) => {
    if (evt.source !== "figma" || !evt.meta) return evt;
    const jiraKey = findJiraProjectKey(evt.meta.texts, mapping);
    return jiraKey ? { ...evt, projectKey: jiraKey } : evt;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/aggregation/figmaMatching.test.ts && bun test`
Expected: PASS (the whole suite still passes; the type changes are additive).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/aggregation/figmaMatching.ts tests/aggregation/figmaMatching.test.ts
git commit -m "feat: add Figma event types and Jira-key matching"
```

---

### Task 2: Figma client

**Files:**
- Create: `src/clients/figmaClient.ts`
- Test: `tests/clients/figmaClient.test.ts`

**Interfaces:**
- Consumes: `ActivityEvent`, `FigmaEventMeta` from `src/shared/types.ts` (Task 1).
- Produces:
  - `interface FigmaClientConfig { token: string; teamIds: string[] }`
  - `testFigmaConnection(config: FigmaClientConfig): Promise<boolean>`
  - `fetchFigmaActivity(config: FigmaClientConfig, since: Date, until: Date): Promise<ActivityEvent[]>` — events sorted ascending by timestamp; each has `projectKey: "figma:file:<key>"`, `source: "figma"`, `label: <file name>`, `meta`. Throws `Error` on any non-2xx response.

- [ ] **Step 1: Write the failing test**

Create `tests/clients/figmaClient.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/clients/figmaClient.test.ts`
Expected: FAIL — cannot find module `../../src/clients/figmaClient`.

- [ ] **Step 3: Write minimal implementation**

Create `src/clients/figmaClient.ts`:

```ts
import type { ActivityEvent } from "../shared/types";

export interface FigmaClientConfig {
  token: string;
  teamIds: string[];
}

interface FigmaVersion {
  created_at: string;
  label: string | null;
  description: string | null;
  user: { id: string };
}
interface FigmaVersionsResponse {
  versions: FigmaVersion[];
  pagination?: { next_page?: string };
}
interface FigmaComment {
  message: string;
  created_at: string;
  user: { id: string };
}

const BASE_URL = "https://api.figma.com";
const MAX_VERSION_PAGES = 20;

async function figmaGet<T>(config: FigmaClientConfig, urlOrPath: string): Promise<T> {
  // Pagination hands us absolute URLs; never send the token anywhere but Figma's API.
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${BASE_URL}${urlOrPath}`;
  if (!url.startsWith(`${BASE_URL}/`)) throw new Error(`Refusing to call non-Figma URL: ${url}`);
  const res = await fetch(url, { headers: { "X-Figma-Token": config.token } });
  if (!res.ok) throw new Error(`Figma request ${urlOrPath} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function testFigmaConnection(config: FigmaClientConfig): Promise<boolean> {
  try {
    await figmaGet(config, "/v1/me");
    return true;
  } catch {
    return false;
  }
}

function inRange(iso: string, since: Date, until: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= until.getTime();
}

async function fetchFileEvents(
  config: FigmaClientConfig,
  userId: string,
  file: { key: string; name: string },
  folderName: string,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  const projectKey = `figma:file:${file.key}`;
  const make = (timestamp: string, extraTexts: (string | null)[]): ActivityEvent => ({
    projectKey,
    timestamp,
    source: "figma",
    label: file.name,
    meta: {
      fileName: file.name,
      folderName,
      texts: [file.name, ...extraTexts].filter((t): t is string => Boolean(t)),
    },
  });

  let next: string | undefined = `/v1/files/${file.key}/versions`;
  for (let page = 0; next && page < MAX_VERSION_PAGES; page++) {
    const data: FigmaVersionsResponse = await figmaGet<FigmaVersionsResponse>(config, next);
    for (const v of data.versions) {
      if (v.user.id !== userId || !inRange(v.created_at, since, until)) continue;
      events.push(make(v.created_at, [v.label, v.description]));
    }
    // Versions come newest-first: once a whole page predates the range, older pages cannot matter.
    if (data.versions.length > 0 && data.versions.every((v) => new Date(v.created_at) < since)) break;
    next = data.pagination?.next_page;
  }

  const { comments } = await figmaGet<{ comments: FigmaComment[] }>(config, `/v1/files/${file.key}/comments`);
  for (const c of comments) {
    if (c.user.id !== userId || !inRange(c.created_at, since, until)) continue;
    events.push(make(c.created_at, [c.message]));
  }

  return events;
}

export async function fetchFigmaActivity(
  config: FigmaClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const me = await figmaGet<{ id: string }>(config, "/v1/me");
  const events: ActivityEvent[] = [];

  for (const teamId of config.teamIds) {
    const { projects } = await figmaGet<{ projects: { id: string; name: string }[] }>(
      config,
      `/v1/teams/${encodeURIComponent(teamId)}/projects`
    );
    for (const project of projects) {
      const { files } = await figmaGet<{ files: { key: string; name: string; last_modified: string }[] }>(
        config,
        `/v1/projects/${encodeURIComponent(project.id)}/files`
      );
      for (const file of files) {
        // A file untouched since before the range cannot hold versions inside it.
        if (new Date(file.last_modified) < since) continue;
        events.push(...(await fetchFileEvents(config, me.id, file, project.name, since, until)));
      }
    }
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/clients/figmaClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/figmaClient.ts tests/clients/figmaClient.test.ts
git commit -m "feat: add Figma client for versions and comments"
```

---

### Task 3: Generate route integration

**Files:**
- Modify: `src/routes/generateRoutes.ts`
- Modify: `src/app.ts`
- Test: `tests/routes/generateRoutes.test.ts`

**Interfaces:**
- Consumes: `fetchFigmaActivity`, `FigmaClientConfig` (Task 2); `remapFigmaEvents` (Task 1); `MappingHint`, `MonthlySummary.missingHints/warnings` (Task 1).
- Produces: `GenerateDeps.fetchFigmaActivity: (c: NonNullable<AppConfig["figma"]>, since: Date, until: Date) => Promise<ActivityEvent[]>`. The response now always contains `warnings: string[]` and `missingHints: Record<string, MappingHint>` (hint only for missing keys whose events carry `meta`; label format `"<folderName> / <fileName>"`).

- [ ] **Step 1: Write the failing tests**

In `tests/routes/generateRoutes.test.ts`:

1. Add a second config below `sampleConfig`:

```ts
const figmaConfig: AppConfig = { ...sampleConfig, figma: { token: "ft", teamIds: ["team1"] } };
```

2. In `buildApp`, add `fetchFigmaActivity: async () => [],` to the default deps (next to `fetchJiraActivity`).

3. Add these tests inside `describe("generate route", ...)` (before its closing `});`):

```ts
  const figmaEvent = (texts: string[] = ["Homepage"]) => ({
    projectKey: "figma:file:abc",
    timestamp: "2026-02-05T08:00:00Z",
    source: "figma" as const,
    label: "Homepage",
    meta: { fileName: "Homepage", folderName: "Acme", texts },
  });

  it("turns Figma activity into rows, reports the file as a missing mapping and provides a readable hint", async () => {
    const summary = await post(
      buildApp({ loadConfig: async () => figmaConfig, fetchFigmaActivity: async () => [figmaEvent()] }),
      "2026-02"
    );
    const feb5 = summary.rows.filter((r: any) => r.date === "2026-02-05");
    expect(feb5.length).toBe(1);
    expect(feb5[0].projectKey).toBe("figma:file:abc");
    expect(feb5[0].description).toBe("Homepage");
    expect(summary.missingMappings).toEqual(["figma:file:abc"]);
    expect(summary.missingHints["figma:file:abc"]).toEqual({
      label: "Acme / Homepage",
      folderName: "Acme",
      fileName: "Homepage",
    });
    expect(summary.warnings).toEqual([]);
  });

  it("attributes a Figma event to the mapped Jira project when its texts contain that Jira key", async () => {
    const summary = await post(
      buildApp({
        loadConfig: async () => figmaConfig,
        loadMapping: async () => ({ "jira:PROJ": { kimaiProjectId: 7, kimaiActivityId: 8 } }),
        fetchFigmaActivity: async () => [figmaEvent(["Homepage", "PROJ-12 handoff"])],
      }),
      "2026-02"
    );
    const feb5 = summary.rows.filter((r: any) => r.date === "2026-02-05");
    expect(feb5.length).toBe(1);
    expect(feb5[0].projectKey).toBe("jira:PROJ");
    expect(feb5[0].kimaiProjectId).toBe(7);
    expect(feb5[0].kimaiActivityId).toBe(8);
    expect(summary.missingMappings).toEqual([]);
  });

  it("drops Figma activity of an ignored file", async () => {
    const summary = await post(
      buildApp({
        loadConfig: async () => figmaConfig,
        loadMapping: async () => ({ "figma:file:abc": { ignored: true } }),
        fetchFigmaActivity: async () => [figmaEvent()],
      }),
      "2026-02"
    );
    const feb5 = summary.rows.filter((r: any) => r.date === "2026-02-05");
    expect(feb5.every((r: any) => r.status === "manual")).toBe(true);
    expect(summary.missingMappings).toEqual([]);
  });

  it("does not call Figma when it is not configured or has no team ids", async () => {
    let calls = 0;
    const fetchFigmaActivity = async () => {
      calls++;
      return [];
    };
    await post(buildApp({ fetchFigmaActivity }), "2026-02"); // no figma section
    await post(
      buildApp({ loadConfig: async () => ({ ...sampleConfig, figma: { token: "ft", teamIds: [] } }), fetchFigmaActivity }),
      "2026-02"
    );
    expect(calls).toBe(0);
  });

  it("still returns GitHub rows plus a warning when Figma fails", async () => {
    const summary = await post(
      buildApp({
        loadConfig: async () => figmaConfig,
        fetchGithubActivity: async () => [
          { projectKey: "github:a/b", timestamp: "2026-02-05T08:00:00Z", source: "github" },
        ],
        fetchFigmaActivity: async () => {
          throw new Error("Figma request /v1/me failed: 429");
        },
      }),
      "2026-02"
    );
    expect(summary.rows.some((r: any) => r.projectKey === "github:a/b")).toBe(true);
    expect(summary.warnings.length).toBe(1);
    expect(summary.warnings[0]).toContain("Figm");
    expect(summary.warnings[0]).toContain("429");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/generateRoutes.test.ts`
Expected: FAIL — the new tests fail (no Figma handling, no `warnings`/`missingHints`); existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/generateRoutes.ts`:

Update the imports and `GenerateDeps`:

```ts
import { Hono } from "hono";
import type {
  ActivityEvent,
  AppConfig,
  MappingEntry,
  MappingHint,
  MappingStore,
  MonthlySummary,
  SummaryRow,
} from "../shared/types";
import { aggregateDay } from "../aggregation/dayAggregator";
import { remapFigmaEvents } from "../aggregation/figmaMatching";
import { toLocalDateString, eachLocalDateInMonth, isWeekend } from "../shared/dateUtils";

export interface GenerateDeps {
  loadConfig: () => Promise<AppConfig | null>;
  loadMapping: () => Promise<MappingStore>;
  fetchGithubActivity: (c: AppConfig["github"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchJiraActivity: (c: AppConfig["jira"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchFigmaActivity: (
    c: NonNullable<AppConfig["figma"]>,
    since: Date,
    until: Date
  ) => Promise<ActivityEvent[]>;
  fetchKimaiTimesheets: (
    c: AppConfig["kimai"],
    since: Date,
    until: Date
  ) => Promise<{ id: number; begin: string; end: string; project: number; activity: number }[]>;
}
```

Add this helper after `groupByLocalDay`:

```ts
function buildHints(events: ActivityEvent[], keys: string[]): Record<string, MappingHint> {
  const hints: Record<string, MappingHint> = {};
  for (const key of keys) {
    const meta = events.find((e) => e.projectKey === key && e.meta)?.meta;
    if (meta) hints[key] = { label: `${meta.folderName} / ${meta.fileName}`, folderName: meta.folderName, fileName: meta.fileName };
  }
  return hints;
}
```

Replace the block from `const [githubEvents, jiraEvents, existingTimesheets] = await Promise.all([` through the `const activeEvents = ...` line with:

```ts
    const warnings: string[] = [];
    const figmaConfig =
      config.figma && config.figma.token && config.figma.teamIds.length > 0 ? config.figma : null;
    const figmaPromise: Promise<ActivityEvent[]> = figmaConfig
      ? deps.fetchFigmaActivity(figmaConfig, since, until).catch((err: Error) => {
          // Figma is optional: a failure must not throw away the GitHub/Jira half of the month.
          warnings.push(`Nie udalo sie pobrac aktywnosci z Figmy: ${err.message}`);
          return [];
        })
      : Promise.resolve([]);

    const [githubEvents, jiraEvents, figmaEvents, existingTimesheets] = await Promise.all([
      deps.fetchGithubActivity(config.github, since, until),
      deps.fetchJiraActivity(config.jira, since, until),
      figmaPromise,
      deps.fetchKimaiTimesheets(config.kimai, since, until),
    ]);

    const daysWithExistingEntries = new Set(existingTimesheets.map((t) => toLocalDateString(t.begin)));
    const allEvents = [...githubEvents, ...jiraEvents, ...remapFigmaEvents(figmaEvents, mapping)];
    const activeEvents = allEvents.filter((evt) => !isIgnored(mapping[evt.projectKey]));
```

Replace the `const summary` line with:

```ts
    const missing = [...missingMappings];
    const summary: MonthlySummary = {
      month,
      rows,
      missingMappings: missing,
      missingHints: buildHints(activeEvents, missing),
      warnings,
    };
```

In `src/app.ts`, add the import and dep:

```ts
import { testFigmaConnection, fetchFigmaActivity } from "./clients/figmaClient";
```
(only `fetchFigmaActivity` is needed now; import `testFigmaConnection` in Task 4 — to avoid an unused import, write `import { fetchFigmaActivity } from "./clients/figmaClient";` here) and change the generate route registration to:

```ts
  app.route(
    "/api/generate",
    createGenerateRoutes({
      loadConfig,
      loadMapping,
      fetchGithubActivity,
      fetchJiraActivity,
      fetchFigmaActivity,
      fetchKimaiTimesheets,
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS (whole suite, including `tests/app.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/routes/generateRoutes.ts src/app.ts tests/routes/generateRoutes.test.ts
git commit -m "feat: include Figma activity in generate with Jira-key remap, hints and warnings"
```

---

### Task 4: Figma settings (route, API type, UI)

**Files:**
- Modify: `src/routes/settingsRoutes.ts`
- Modify: `src/app.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/SettingsPage.tsx`
- Test: `tests/routes/settingsRoutes.test.ts`

**Interfaces:**
- Consumes: `testFigmaConnection`, `FigmaClientConfig` (Task 2); `AppConfig.figma` (Task 1).
- Produces: `SettingsDeps.testFigmaConnection: (c: NonNullable<AppConfig["figma"]>) => Promise<boolean>`. `POST /api/settings/test` response gains `figma: boolean` **only** when `config.figma?.token` is non-empty (otherwise the key is absent, so the existing response shape is unchanged).

- [ ] **Step 1: Write the failing tests**

In `tests/routes/settingsRoutes.test.ts`:

1. Add `testFigmaConnection: async () => true,` to the default deps in `buildApp` (after `testJiraConnection`).
2. Add inside the `describe` block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/settingsRoutes.test.ts`
Expected: FAIL on the new test (`figma` undefined).

- [ ] **Step 3: Write minimal implementation**

`src/routes/settingsRoutes.ts` — add to `SettingsDeps`:

```ts
  testFigmaConnection: (c: NonNullable<AppConfig["figma"]>) => Promise<boolean>;
```

Replace the `const [kimai, github, jira] = await Promise.all([...]);` statement with:

```ts
    const figmaConfig = config.figma?.token ? config.figma : null;
    const [kimai, github, jira, figma] = await Promise.all([
      deps.testKimaiConnection(config.kimai),
      deps.testGithubConnection(config.github),
      deps.testJiraConnection(config.jira),
      figmaConfig ? deps.testFigmaConnection(figmaConfig) : Promise.resolve(null),
    ]);
```

Replace the final `return c.json({ kimai, github, githubWarning, jira });` with:

```ts
    return c.json({ kimai, github, githubWarning, jira, ...(figma === null ? {} : { figma }) });
```

`src/app.ts` — change the figma import to `import { testFigmaConnection, fetchFigmaActivity } from "./clients/figmaClient";` and add `testFigmaConnection,` to the `createSettingsRoutes({...})` deps (after `testJiraConnection,`).

`web/src/api.ts` — in `testConnections`, change the response type to:

```ts
      json<{ kimai: boolean; github: boolean; githubWarning: string | null; jira: boolean; figma?: boolean }>(r)
```

`web/src/pages/SettingsPage.tsx`:

a. Change the `status` state type to include `figma?: boolean`:

```tsx
  const [status, setStatus] = useState<{
    kimai: boolean;
    github: boolean;
    githubWarning: string | null;
    jira: boolean;
    figma?: boolean;
  } | null>(null);
```

b. Below the `saving` state, add:

```tsx
  const [figmaToken, setFigmaToken] = useState("");
  const [figmaTeams, setFigmaTeams] = useState(""); // comma-separated team ids, parsed on save/test
```

c. Replace the `useEffect` with:

```tsx
  useEffect(() => {
    api.getConfig().then((c) => {
      if (!c) return;
      setConfig(c);
      setFigmaToken(c.figma?.token ?? "");
      setFigmaTeams((c.figma?.teamIds ?? []).join(", "));
    });
  }, []);

  function currentConfig(): AppConfig {
    const { figma: _previous, ...rest } = config;
    const teamIds = figmaTeams.split(",").map((s) => s.trim()).filter(Boolean);
    return figmaToken.trim() ? { ...rest, figma: { token: figmaToken.trim(), teamIds } } : rest;
  }
```

d. In `handleTest` use `api.testConnections(currentConfig())`; in `handleSave` use `api.saveConfig(currentConfig())`.

e. Add this fieldset after the Jira fieldset (before the `toolbar` div):

```tsx
      <fieldset>
        <legend>Figma (opcjonalnie)</legend>
        <div className="field">
          <label>
            Personal access token{" "}
            {status?.figma !== undefined && (
              <span className={status.figma ? "status-ok" : "status-fail"}>{status.figma ? "OK" : "Blad"}</span>
            )}
          </label>
          <input placeholder="figd_..." value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} />
          <p className="hint">
            Figma -&gt; Settings -&gt; Security -&gt; Personal access tokens. Wymagane zakresy: file_content:read,
            file_versions:read, file_comments:read, projects:read. Zostaw puste, zeby pominac Figme.
          </p>
        </div>
        <div className="field">
          <label>Team ID</label>
          <input placeholder="123456789012345678" value={figmaTeams} onChange={(e) => setFigmaTeams(e.target.value)} />
          <p className="hint">
            Numer z adresu teamu: figma.com/files/team/<strong>ID</strong>/... Kilka teamow oddziel przecinkami.
            Figma nie udostepnia listy teamow przez API, wiec trzeba je wpisac recznie.
          </p>
        </div>
      </fieldset>
```

- [ ] **Step 4: Run tests and build to verify**

Run: `bun test && bun run build:web`
Expected: all tests PASS; the Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settingsRoutes.ts src/app.ts web/src/api.ts web/src/pages/SettingsPage.tsx tests/routes/settingsRoutes.test.ts
git commit -m "feat: add Figma token and team ids to settings with connection test"
```

---

### Task 5: Mapping suggestion

**Files:**
- Create: `src/shared/suggestMapping.ts`
- Test: `tests/shared/suggestMapping.test.ts`

**Interfaces:**
- Consumes: `MappingHint`, `MappingStore` (Task 1).
- Produces: `interface MappingSuggestion { kimaiProjectId: number; kimaiActivityId?: number }` and `suggestMapping(hint: MappingHint, mapping: MappingStore, projects: { id: number; name: string }[]): MappingSuggestion | null`. Order: (a) an already-mapped (non-ignored) entry whose `label` starts with `"<hint.folderName> / "` — returns its project and activity; (b) otherwise the Kimai project whose normalized name best matches the folder or file name (containment, scored by length ratio, both names ≥ 3 chars) — project only; (c) otherwise `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/shared/suggestMapping.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { suggestMapping } from "../../src/shared/suggestMapping";
import type { MappingHint, MappingStore } from "../../src/shared/types";

const hint: MappingHint = { label: "Acme Studio / Homepage", folderName: "Acme Studio", fileName: "Homepage" };
const projects = [
  { id: 1, name: "Beta" },
  { id: 2, name: "Acme" },
];

describe("suggestMapping", () => {
  it("prefers the project of another already-mapped file from the same folder, with its activity", () => {
    const mapping: MappingStore = {
      "figma:file:other": { kimaiProjectId: 1, kimaiActivityId: 9, label: "Acme Studio / Checkout" },
    };
    expect(suggestMapping(hint, mapping, projects)).toEqual({ kimaiProjectId: 1, kimaiActivityId: 9 });
  });

  it("ignores ignored siblings and siblings from other folders", () => {
    const mapping: MappingStore = {
      "figma:file:a": { ignored: true, label: "Acme Studio / Secret" },
      "figma:file:b": { kimaiProjectId: 1, kimaiActivityId: 9, label: "Acme Studio 2 / Other" },
    };
    expect(suggestMapping(hint, mapping, projects)).toEqual({ kimaiProjectId: 2 });
  });

  it("falls back to the most similar Kimai project name (project only)", () => {
    expect(suggestMapping(hint, {}, projects)).toEqual({ kimaiProjectId: 2 });
  });

  it("picks the better ratio when several names match", () => {
    const many = [
      { id: 1, name: "Acme" },
      { id: 2, name: "Acme Studio Redesign" },
    ];
    expect(suggestMapping(hint, {}, many)).toEqual({ kimaiProjectId: 2 });
  });

  it("matches ignoring case, diacritics and punctuation", () => {
    const h: MappingHint = { label: "Łódź-Sklep / x", folderName: "Łódź-Sklep", fileName: "x" };
    expect(suggestMapping(h, {}, [{ id: 5, name: "lodz sklep" }])).toEqual({ kimaiProjectId: 5 });
  });

  it("also tries the file name", () => {
    const h: MappingHint = { label: "Misc / Beta app", folderName: "Misc", fileName: "Beta app" };
    expect(suggestMapping(h, {}, projects)).toEqual({ kimaiProjectId: 1 });
  });

  it("returns null when nothing is similar and never matches names shorter than 3 characters", () => {
    expect(suggestMapping({ label: "Zed / Q", folderName: "Zed", fileName: "Q" }, {}, projects)).toBeNull();
    expect(suggestMapping(hint, {}, [{ id: 3, name: "Ac" }])).toBeNull();
    expect(suggestMapping(hint, {}, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/shared/suggestMapping.test.ts`
Expected: FAIL — cannot find module `../../src/shared/suggestMapping`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/suggestMapping.ts`:

```ts
import type { MappingHint, MappingStore } from "./types";

export interface MappingSuggestion {
  kimaiProjectId: number;
  kimaiActivityId?: number;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l") // ł has no decomposition
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 0 = unrelated; otherwise the length ratio of the shorter name to the longer one (1 = identical). */
function similarity(a: string, b: string): number {
  if (a.length < 3 || b.length < 3) return 0;
  if (!a.includes(b) && !b.includes(a)) return 0;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

export function suggestMapping(
  hint: MappingHint,
  mapping: MappingStore,
  projects: { id: number; name: string }[]
): MappingSuggestion | null {
  const folderPrefix = `${hint.folderName} / `;
  for (const entry of Object.values(mapping)) {
    if ("kimaiProjectId" in entry && entry.label?.startsWith(folderPrefix)) {
      return { kimaiProjectId: entry.kimaiProjectId, kimaiActivityId: entry.kimaiActivityId };
    }
  }

  const hintNames = [normalize(hint.folderName), normalize(hint.fileName)];
  let best: { id: number; score: number } | null = null;
  for (const project of projects) {
    const name = normalize(project.name);
    const score = Math.max(...hintNames.map((h) => similarity(name, h)));
    if (score > 0 && (!best || score > best.score)) best = { id: project.id, score };
  }
  return best ? { kimaiProjectId: best.id } : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/shared/suggestMapping.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/suggestMapping.ts tests/shared/suggestMapping.test.ts
git commit -m "feat: suggest a Kimai project for a new Figma file"
```

---

### Task 6: Mapping UI (labels, suggestions, warnings)

**Files:**
- Create: `web/src/mappingEntry.ts`
- Test: `tests/web/mappingEntry.test.ts`
- Modify: `web/src/pages/MappingsManagerPage.tsx`, `web/src/pages/MappingPage.tsx`, `web/src/pages/SummaryPage.tsx`, `web/src/pages/HomePage.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `suggestMapping` (Task 5); `MappingHint`, `MonthlySummary.missingHints/warnings`, `MappingEntry.label` (Task 1).
- Produces:
  - `web/src/mappingEntry.ts`: `type LocalEntry = { kimaiProjectId: number; kimaiActivityId: number; ignored: boolean; label?: string }`, `toLocalEntry(entry: MappingEntry): LocalEntry`, `toMappingEntry(e: LocalEntry): MappingEntry` (both preserve `label`; `label` key is omitted when undefined).
  - `MappingPage` gains prop `hints: Record<string, MappingHint>`.

- [ ] **Step 1: Write the failing test**

Create `tests/web/mappingEntry.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { toLocalEntry, toMappingEntry } from "../../web/src/mappingEntry";

describe("mappingEntry", () => {
  it("round-trips a project mapping and keeps its label", () => {
    const entry = { kimaiProjectId: 1, kimaiActivityId: 2, label: "Acme / Homepage" };
    expect(toMappingEntry(toLocalEntry(entry))).toEqual(entry);
  });

  it("round-trips an ignored mapping and keeps its label", () => {
    const entry = { ignored: true as const, label: "Acme / Secret" };
    expect(toMappingEntry(toLocalEntry(entry))).toEqual(entry);
  });

  it("does not add a label key when there is none", () => {
    expect(toMappingEntry(toLocalEntry({ kimaiProjectId: 1, kimaiActivityId: 2 }))).toEqual({
      kimaiProjectId: 1,
      kimaiActivityId: 2,
    });
    expect("label" in toMappingEntry(toLocalEntry({ ignored: true }))).toBe(false);
  });

  it("applies edits made on the local entry", () => {
    const local = { ...toLocalEntry({ kimaiProjectId: 1, kimaiActivityId: 2, label: "L" }), ignored: true };
    expect(toMappingEntry(local)).toEqual({ ignored: true, label: "L" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/web/mappingEntry.test.ts`
Expected: FAIL — cannot find module `../../web/src/mappingEntry`.

- [ ] **Step 3: Write the implementation**

Create `web/src/mappingEntry.ts`:

```ts
import type { MappingEntry } from "@shared/types";

export type LocalEntry = { kimaiProjectId: number; kimaiActivityId: number; ignored: boolean; label?: string };

export function toLocalEntry(entry: MappingEntry): LocalEntry {
  const label = entry.label !== undefined ? { label: entry.label } : {};
  if ("ignored" in entry) return { kimaiProjectId: 0, kimaiActivityId: 0, ignored: true, ...label };
  return { kimaiProjectId: entry.kimaiProjectId, kimaiActivityId: entry.kimaiActivityId, ignored: false, ...label };
}

export function toMappingEntry(e: LocalEntry): MappingEntry {
  const label = e.label !== undefined ? { label: e.label } : {};
  return e.ignored
    ? { ignored: true, ...label }
    : { kimaiProjectId: e.kimaiProjectId, kimaiActivityId: e.kimaiActivityId, ...label };
}
```

Note: the test imports this file by relative path, and it imports `@shared/types` as a **type-only** import (erased at runtime), so bun needs no alias — same as `web/src/summaryHours.ts`.

Now the pages.

`web/src/pages/MappingsManagerPage.tsx`:
- Remove the local `LocalEntry` type and `toLocalEntry` function; add `import { toLocalEntry, toMappingEntry, type LocalEntry } from "../mappingEntry";` and drop the now-unused `MappingStore` import only if nothing else uses it (it is still used for `useState<MappingStore | null>` — keep it).
- In `handleSaveAll`, replace the `const entry = e.ignored ? ... : ...;` statement and the save call with:

```tsx
      for (const [projectKey, e] of Object.entries(edits)) {
        await api.saveMappingEntry(projectKey, toMappingEntry(e));
      }
```
- In the row, replace `<span className="project-key">{projectKey}</span>` with:

```tsx
                <span className="project-key" title={projectKey}>{e.label ?? projectKey}</span>
```

`web/src/pages/MappingPage.tsx`:
- Imports: `import type { MappingHint } from "@shared/types";` and `import { suggestMapping } from "@shared/suggestMapping";`.
- Props: add `hints: Record<string, MappingHint>` (destructure and add to the type: `hints: Record<string, MappingHint>;`).
- Replace the `useEffect` with:

```tsx
  useEffect(() => {
    Promise.all([api.getKimaiOptions(), api.getMapping()]).then(([kimaiOptions, mapping]) => {
      setOptions(kimaiOptions);
      const suggested: Record<string, { kimaiProjectId: number; kimaiActivityId: number }> = {};
      for (const key of missingMappings) {
        const hint = hints[key];
        if (!hint) continue;
        const s = suggestMapping(hint, mapping, kimaiOptions.projects);
        if (s) suggested[key] = { kimaiProjectId: s.kimaiProjectId, kimaiActivityId: s.kimaiActivityId ?? 0 };
      }
      setChoices(suggested);
    });
  }, []);
```
- In `handleSaveAll`, replace the loop body with:

```tsx
      for (const projectKey of missingMappings) {
        const labelPart = hints[projectKey] ? { label: hints[projectKey].label } : {};
        if (skipped.has(projectKey)) {
          await api.saveMappingEntry(projectKey, { ignored: true, ...labelPart });
          continue;
        }
        const choice = choices[projectKey];
        if (!choice?.kimaiProjectId || !choice?.kimaiActivityId) continue;
        await api.saveMappingEntry(projectKey, { ...choice, ...labelPart });
      }
```
- Make both selects controlled so suggestions show: in the project select replace `defaultValue=""` with `value={choices[projectKey]?.kimaiProjectId || ""}`; in the activity select replace `defaultValue=""` with `value={choices[projectKey]?.kimaiActivityId || ""}`.
- Replace `<span className="project-key">{projectKey}</span>` with `<span className="project-key" title={projectKey}>{hints[projectKey]?.label ?? projectKey}</span>`.
- Update the hint paragraph text's first sentence to: `Te repozytoria/projekty/pliki Figmy nie maja jeszcze przypisanego projektu i aktywnosci w Kimai. Podpowiedzi sa tylko sugestia — sprawdz je.` (keep the rest of the paragraph).

`web/src/App.tsx`:
- Change the `mapping` view type to `{ name: "mapping"; month: string; missingMappings: string[]; hints: Record<string, MappingHint> }` and add `MappingHint` to the type import from `@shared/types`.
- In `onGenerated`, the mapping branch becomes:

```tsx
              ? {
                  name: "mapping",
                  month: summary.month,
                  missingMappings: summary.missingMappings,
                  hints: summary.missingHints ?? {},
                }
```
- Pass `hints={view.hints}` to `<MappingPage ... />`.

`web/src/pages/SummaryPage.tsx` — directly after the `<p className="hint">...</p>` that follows the toolbar (before `<table>`), add:

```tsx
      {summary.warnings?.map((warning) => (
        <p className="alert" role="alert" key={warning}>
          {warning}
        </p>
      ))}
```

`web/src/pages/HomePage.tsx` — change the hint text `Pobierze Twoja aktywnosc z GitHub i Jiry za ten miesiac` to `Pobierze Twoja aktywnosc z GitHub, Jiry i Figmy (jesli skonfigurowana) za ten miesiac`.

- [ ] **Step 4: Run tests and build to verify**

Run: `bun test && bun run build:web`
Expected: all tests PASS; the Vite build succeeds with no errors.

Manual check (needs real credentials, do it if available; otherwise state it was not run): `KIMAJ_SE_HOME=$(mktemp -d)`-style isolated run is not enough because Generate also needs GitHub/Jira — use the real `~/.kimaj-se` config with a Figma token and team id added in Ustawienia, run Generate for a month with Figma work, and confirm: a Figma row appears; a new file shows as `Folder / File` with a pre-selected project when a sibling or a similarly named Kimai project exists; after saving, "Mapowania" lists it by name and an edit there keeps the name.

- [ ] **Step 5: Commit**

```bash
git add web/src tests/web/mappingEntry.test.ts
git commit -m "feat: show Figma file labels and mapping suggestions, surface Figma warnings"
```

---

### Task 7: README and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: user-facing docs.

- [ ] **Step 1: Document the feature**

In `README.md`:

1. In the intro paragraph, change "na podstawie Twojej aktywnosci na GitHubie i w Jirze" to "na podstawie Twojej aktywnosci na GitHubie, w Jirze i (opcjonalnie) w Figmie".
2. After the `### Jira` subsection of "Pierwsza konfiguracja", add:

```markdown
### Figma (opcjonalnie)
- **Personal access token** — Figma -> Settings -> Security -> Personal access tokens. Zakresy: `file_content:read`,
  `file_versions:read`, `file_comments:read`, `projects:read`.
- **Team ID** — numer z adresu teamu: `figma.com/files/team/<ID>/...`. Kilka teamow oddziel przecinkami (Figma nie
  udostepnia listy teamow przez API).

Zostaw token pusty, zeby pominac Figme. Aplikacja liczy Twoje zapisane wersje plikow i Twoje komentarze; caly plik to
jeden projekt w Kimai (strony/pages wewnatrz pliku nie sa rozrozniane). Jesli w nazwie pliku, opisie wersji albo
komentarzu jest klucz Jiry z juz zapisanym mapowaniem (np. `PROJ-123`), praca trafi do tego samego projektu co Jira.
W przeciwnym razie plik dostanie wlasne mapowanie — przy pierwszym uzyciu aplikacja podpowie projekt Kimai (na
podstawie innego pliku z tego samego folderu albo podobnej nazwy). Blad Figmy nie blokuje generowania — zobaczysz
ostrzezenie w podsumowaniu.
```

- [ ] **Step 2: Full verification**

Run: `bun test && bun run build:web`
Expected: entire suite PASSES; Vite build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Figma sync"
```
