# GitHub + Jira -> Kimai Timesheet Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run app (single compiled binary) that auto-generates a month of Kimai timesheet entries from GitHub and Jira activity, lets the user review/edit them, resolve project mappings, and submit them to Kimai.

**Architecture:** Bun + Hono backend exposes a small REST API (`/api/settings`, `/api/mapping`, `/api/generate`, `/api/submit`) and serves a static React+Vite frontend with four screens (Settings, Home, Mapping, Summary). Local state (tokens, project mapping) lives in JSON files under `~/.kimaj-se/`. The whole app ships as one binary via `bun build --compile`.

**Tech Stack:** Bun (runtime + test runner + bundler), Hono (backend routing), React + Vite (frontend), TypeScript throughout. No ORM/DB — flat JSON files. No extra HTTP client libraries — native `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-28-github-jira-kimai-integration-design.md`

## Global Constraints

- Runtime/framework: Bun + Hono for the backend, React + Vite for the frontend — no alternate frameworks.
- Packaging: `bun build --compile` into a single binary; target macOS first.
- Local storage only in `~/.kimaj-se/config.json` and `~/.kimaj-se/mapping.json`; never written into the repo.
- Hour allocation: for a day with activity, split 8h proportionally to each project's activity span, rounded to the nearest 0.5h, always summing to exactly 8h for that day.
- Idempotency: any day that already has at least one existing Kimai entry is skipped entirely (never topped up, never duplicated).
- Approval flow: one aggregate monthly summary reviewed/edited by the user, one confirmation, not per-day confirmation.
- No automated end-to-end UI tests for this iteration (per spec, YAGNI) — UI tasks are verified by manual run-through, not test files.

## Review Focus

- A month with zero GitHub/Jira activity must still produce a full set of manual-entry rows (one per calendar day) without the generate endpoint crashing or returning an empty list.
- A day touching 3+ projects, including a project with only a single event (zero time span), must still split into blocks that are all > 0 and sum to exactly 8h — no negative, zero, or `NaN` blocks from the proportional split.
- A day where Kimai already has an entry covering only part of the 8h (e.g. 2h manually logged) must be skipped entirely, not topped up with the remaining 6h.
- Activity timestamps near local (Europe/Warsaw) midnight must be grouped into the correct calendar day even though the API timestamps are UTC — naive `.slice(0, 10)` on a UTC ISO string silently assigns late-evening Polish activity to the wrong day.
- An invalid/expired Kimai token failing mid-submit (e.g. on row 3 of 10) must not abort the remaining rows — every row is attempted independently and reports its own success/error.

---

## Task 1: Project scaffolding and health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/app.ts`
- Create: `src/index.ts`
- Test: `tests/app.test.ts`

**Interfaces:**
- Produces: `createApp(): Hono` (exported from `src/app.ts`), mounting routes at `/api/health` for now — later tasks add more routes to this same function.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app.test.ts
import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";

describe("health check", () => {
  it("responds with ok", async () => {
    const app = createApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/app.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Create project files and minimal implementation**

```json
// package.json
{
  "name": "kimaj-se",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev:server": "PORT=3001 bun --watch src/index.ts",
    "dev:web": "vite",
    "build:web": "vite build",
    "build:binary": "bun build --compile --outfile dist/kimaj-se src/index.ts",
    "build": "bun run build:web && bun run build:binary",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/bun": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["bun"]
  },
  "include": ["src", "tests", "web/src"]
}
```

```
# .gitignore
node_modules/
web/dist/
dist/
.DS_Store
*.log
```

```ts
// src/app.ts
import { Hono } from "hono";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  return app;
}
```

```ts
// src/index.ts
import { createApp } from "./app";

const app = createApp();
const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;
const server = Bun.serve({ fetch: app.fetch, port: requestedPort });

console.log(`kimaj-se running at http://localhost:${server.port}`);

if (!process.env.KIMAJ_SE_NO_OPEN) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([opener, `http://localhost:${server.port}`]);
}
```

- [ ] **Step 4: Install dependencies and run test to verify it passes**

Run: `bun install && bun test tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore src/app.ts src/index.ts tests/app.test.ts
git commit -m "chore: scaffold Bun/Hono project with health check"
```

---

## Task 2: Shared types and local-timezone date utilities

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/dateUtils.ts`
- Test: `tests/shared/dateUtils.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  ```ts
  export interface ActivityEvent {
    projectKey: string;   // "github:owner/repo" or "jira:PROJECTKEY"
    timestamp: string;    // ISO 8601 UTC
    source: "github" | "jira";
  }
  export interface DayBlock {
    projectKey: string;
    beginIso: string;
    endIso: string;
    hours: number;
  }
  export interface SummaryRow {
    date: string;                 // YYYY-MM-DD (local calendar day)
    projectKey: string | null;
    kimaiProjectId: number | null;
    kimaiActivityId: number | null;
    beginIso: string | null;
    endIso: string | null;
    hours: number;
    description: string;
    status: "auto" | "manual";
  }
  export interface MonthlySummary {
    month: string;                // YYYY-MM
    rows: SummaryRow[];
    missingMappings: string[];    // projectKeys with no mapping entry
  }
  export interface MappingEntry {
    kimaiProjectId: number;
    kimaiActivityId: number;
  }
  export type MappingStore = Record<string, MappingEntry>;
  export interface AppConfig {
    kimai: { baseUrl: string; token: string };
    github: { token: string };
    jira: { baseUrl: string; email: string; token: string };
  }
  export interface SubmitResult {
    date: string;
    projectKey: string | null;
    success: boolean;
    error?: string;
  }
  ```
- Produces (`src/shared/dateUtils.ts`): `toLocalDateString(isoTimestamp: string, timeZone?: string): string`, `eachLocalDateInMonth(month: string): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/shared/dateUtils.test.ts
import { describe, it, expect } from "bun:test";
import { toLocalDateString, eachLocalDateInMonth } from "../../src/shared/dateUtils";

describe("toLocalDateString", () => {
  it("buckets a late-evening Warsaw timestamp into the correct local day", () => {
    // 2026-01-05T23:30:00Z is 2026-01-06T00:30 in Europe/Warsaw (UTC+1 in January)
    expect(toLocalDateString("2026-01-05T23:30:00Z")).toBe("2026-01-06");
  });

  it("keeps a mid-day timestamp on the same day", () => {
    expect(toLocalDateString("2026-01-05T12:00:00Z")).toBe("2026-01-05");
  });
});

describe("eachLocalDateInMonth", () => {
  it("returns every calendar day for a 28-day February", () => {
    const dates = eachLocalDateInMonth("2026-02");
    expect(dates.length).toBe(28);
    expect(dates[0]).toBe("2026-02-01");
    expect(dates[27]).toBe("2026-02-28");
  });

  it("returns every calendar day for a 31-day month", () => {
    const dates = eachLocalDateInMonth("2026-01");
    expect(dates.length).toBe(31);
    expect(dates[30]).toBe("2026-01-31");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/shared/dateUtils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types and implementation**

```ts
// src/shared/types.ts
// (contents exactly as listed in the Interfaces block above)
```

```ts
// src/shared/dateUtils.ts
export function toLocalDateString(isoTimestamp: string, timeZone = "Europe/Warsaw"): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // en-CA formats as YYYY-MM-DD
}

export function eachLocalDateInMonth(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/shared/dateUtils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/dateUtils.ts tests/shared/dateUtils.test.ts
git commit -m "feat: add shared types and local-timezone date utilities"
```

---

## Task 3: Local config storage

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `AppConfig` from `src/shared/types.ts`.
- Produces: `loadConfig(): Promise<AppConfig | null>`, `saveConfig(config: AppConfig): Promise<void>`. Storage location honors `process.env.KIMAJ_SE_HOME` (falls back to `~/.kimaj-se`), so tests can redirect to a temp dir.

- [ ] **Step 1: Write the failing test**

```ts
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../src/config";
import type { AppConfig } from "../src/shared/types";

describe("config storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kimaj-se-test-"));
    process.env.KIMAJ_SE_HOME = tempDir;
  });

  afterEach(async () => {
    delete process.env.KIMAJ_SE_HOME;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when no config file exists", async () => {
    expect(await loadConfig()).toBeNull();
  });

  it("round-trips a saved config", async () => {
    const config: AppConfig = {
      kimai: { baseUrl: "https://time.mindpal.co", token: "kt" },
      github: { token: "gt" },
      jira: { baseUrl: "https://example.atlassian.net", email: "a@b.com", token: "jt" },
    };
    await saveConfig(config);
    expect(await loadConfig()).toEqual(config);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/config.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AppConfig } from "./shared/types";

function appDir(): string {
  return process.env.KIMAJ_SE_HOME ?? join(homedir(), ".kimaj-se");
}

function configPath(): string {
  return join(appDir(), "config.json");
}

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(appDir(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add local config.json storage"
```

---

## Task 4: Local mapping storage

**Files:**
- Create: `src/mapping.ts`
- Test: `tests/mapping.test.ts`

**Interfaces:**
- Consumes: `MappingEntry`, `MappingStore` from `src/shared/types.ts`; same `KIMAJ_SE_HOME` override as Task 3.
- Produces: `loadMapping(): Promise<MappingStore>` (returns `{}` if no file), `saveMappingEntry(projectKey: string, entry: MappingEntry): Promise<MappingStore>` (returns the full updated store).

- [ ] **Step 1: Write the failing test**

```ts
// tests/mapping.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMapping, saveMappingEntry } from "../src/mapping";

describe("mapping storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kimaj-se-test-"));
    process.env.KIMAJ_SE_HOME = tempDir;
  });

  afterEach(async () => {
    delete process.env.KIMAJ_SE_HOME;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns an empty object when no mapping file exists", async () => {
    expect(await loadMapping()).toEqual({});
  });

  it("adds and persists a mapping entry", async () => {
    await saveMappingEntry("github:mRudzki/kimaj-se", { kimaiProjectId: 1, kimaiActivityId: 2 });
    const mapping = await loadMapping();
    expect(mapping["github:mRudzki/kimaj-se"]).toEqual({ kimaiProjectId: 1, kimaiActivityId: 2 });
  });

  it("keeps existing entries when adding a new one", async () => {
    await saveMappingEntry("github:a/b", { kimaiProjectId: 1, kimaiActivityId: 2 });
    await saveMappingEntry("jira:PROJ", { kimaiProjectId: 3, kimaiActivityId: 4 });
    const mapping = await loadMapping();
    expect(Object.keys(mapping).sort()).toEqual(["github:a/b", "jira:PROJ"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/mapping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/mapping.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { MappingEntry, MappingStore } from "./shared/types";

function appDir(): string {
  return process.env.KIMAJ_SE_HOME ?? join(homedir(), ".kimaj-se");
}

function mappingPath(): string {
  return join(appDir(), "mapping.json");
}

export async function loadMapping(): Promise<MappingStore> {
  try {
    const raw = await readFile(mappingPath(), "utf-8");
    return JSON.parse(raw) as MappingStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveMappingEntry(projectKey: string, entry: MappingEntry): Promise<MappingStore> {
  const mapping = await loadMapping();
  mapping[projectKey] = entry;
  await mkdir(appDir(), { recursive: true });
  await writeFile(mappingPath(), JSON.stringify(mapping, null, 2), "utf-8");
  return mapping;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/mapping.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mapping.ts tests/mapping.test.ts
git commit -m "feat: add local mapping.json storage"
```

---

## Task 5: Day aggregation logic

**Files:**
- Create: `src/aggregation/dayAggregator.ts`
- Test: `tests/aggregation/dayAggregator.test.ts`

**Interfaces:**
- Consumes: `ActivityEvent`, `DayBlock` from `src/shared/types.ts`. Assumes all events passed in belong to a single calendar day (caller groups by day first).
- Produces: `aggregateDay(events: ActivityEvent[]): DayBlock[]`.

This is the highest-risk pure logic in the app (Review Focus items 1 and 2) — write every case below as one test file.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/aggregation/dayAggregator.test.ts
import { describe, it, expect } from "bun:test";
import { aggregateDay } from "../../src/aggregation/dayAggregator";
import type { ActivityEvent } from "../../src/shared/types";

function evt(projectKey: string, timestamp: string): ActivityEvent {
  return { projectKey, timestamp, source: "github" };
}

describe("aggregateDay", () => {
  it("returns an empty array for a day with no events", () => {
    expect(aggregateDay([])).toEqual([]);
  });

  it("assigns all 8h to a single project spanning the day", () => {
    const blocks = aggregateDay([
      evt("github:a/b", "2026-01-05T08:00:00Z"),
      evt("github:a/b", "2026-01-05T14:00:00Z"),
    ]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].projectKey).toBe("github:a/b");
    expect(blocks[0].hours).toBe(8);
    expect(new Date(blocks[0].endIso).getTime() - new Date(blocks[0].beginIso).getTime()).toBe(8 * 3600 * 1000);
  });

  it("splits two projects proportionally to their activity span and sums to 8h", () => {
    // project A spans 6h, project B spans 2h -> ratio 3:1
    const blocks = aggregateDay([
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T14:00:00Z"),
      evt("jira:PROJ", "2026-01-05T15:00:00Z"),
      evt("jira:PROJ", "2026-01-05T17:00:00Z"),
    ]);
    const total = blocks.reduce((sum, b) => sum + b.hours, 0);
    expect(total).toBe(8);
    const a = blocks.find((b) => b.projectKey === "github:a")!;
    const b = blocks.find((b) => b.projectKey === "jira:PROJ")!;
    expect(a.hours).toBeGreaterThan(b.hours);
    expect(a.hours % 0.5).toBe(0);
    expect(b.hours % 0.5).toBe(0);
  });

  it("gives every project a non-zero share even when some have a single (zero-span) event, and still sums to 8h", () => {
    const blocks = aggregateDay([
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T13:00:00Z"),
      evt("jira:PROJ1", "2026-01-05T14:00:00Z"), // single event, zero span
      evt("jira:PROJ2", "2026-01-05T16:00:00Z"), // single event, zero span
    ]);
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.hours).toBeGreaterThan(0);
    }
    const total = blocks.reduce((sum, b) => sum + b.hours, 0);
    expect(total).toBe(8);
  });

  it("produces sequential, non-overlapping blocks ordered by first activity", () => {
    const blocks = aggregateDay([
      evt("jira:PROJ", "2026-01-05T15:00:00Z"),
      evt("jira:PROJ", "2026-01-05T16:00:00Z"),
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T09:00:00Z"),
    ]);
    expect(blocks[0].projectKey).toBe("github:a"); // earlier first-activity comes first
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].beginIso).toBe(blocks[i - 1].endIso);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/aggregation/dayAggregator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/aggregation/dayAggregator.ts
import type { ActivityEvent, DayBlock } from "../shared/types";

const MIN_WEIGHT_MS = 15 * 60 * 1000; // floor so a single-event project still gets a share
const HALF_HOUR_MS = 30 * 60 * 1000;
const TOTAL_HOURS = 8;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function floorToHalfHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
}

export function aggregateDay(events: ActivityEvent[]): DayBlock[] {
  if (events.length === 0) return [];

  const byProject = new Map<string, ActivityEvent[]>();
  for (const evt of events) {
    const list = byProject.get(evt.projectKey) ?? [];
    list.push(evt);
    byProject.set(evt.projectKey, list);
  }

  type Group = { projectKey: string; firstMs: number; weightMs: number };
  const groups: Group[] = [...byProject.entries()].map(([projectKey, evts]) => {
    const timestamps = evts.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
    const span = timestamps[timestamps.length - 1] - timestamps[0];
    return { projectKey, firstMs: timestamps[0], weightMs: Math.max(span, MIN_WEIGHT_MS) };
  });
  groups.sort((a, b) => a.firstMs - b.firstMs);

  const totalWeight = groups.reduce((sum, g) => sum + g.weightMs, 0);
  const hoursByProject = groups.map((g) => roundToHalf(TOTAL_HOURS * (g.weightMs / totalWeight)));

  const roundedTotal = hoursByProject.reduce((sum, h) => sum + h, 0);
  const diff = roundToHalf(TOTAL_HOURS - roundedTotal);
  if (diff !== 0) {
    const largestIndex = groups.reduce(
      (best, g, i) => (g.weightMs > groups[best].weightMs ? i : best),
      0
    );
    hoursByProject[largestIndex] = Math.max(0.5, hoursByProject[largestIndex] + diff);
  }

  const dayStart = floorToHalfHour(new Date(Math.min(...groups.map((g) => g.firstMs))));
  const blocks: DayBlock[] = [];
  let cursor = dayStart;
  for (let i = 0; i < groups.length; i++) {
    const hours = hoursByProject[i];
    const end = new Date(cursor.getTime() + hours * 3600 * 1000);
    blocks.push({
      projectKey: groups[i].projectKey,
      beginIso: cursor.toISOString(),
      endIso: end.toISOString(),
      hours,
    });
    cursor = end;
  }
  return blocks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/aggregation/dayAggregator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/aggregation/dayAggregator.ts tests/aggregation/dayAggregator.test.ts
git commit -m "feat: add proportional day aggregation logic"
```

---

## Task 6: Kimai API client

**Files:**
- Create: `src/clients/kimaiClient.ts`
- Test: `tests/clients/kimaiClient.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KimaiClientConfig { baseUrl: string; token: string; }
  export interface KimaiProject { id: number; name: string; }
  export interface KimaiActivity { id: number; name: string; }
  export interface KimaiTimesheet { id: number; begin: string; end: string; project: number; activity: number; }
  export function testKimaiConnection(config: KimaiClientConfig): Promise<boolean>;
  export function fetchKimaiProjects(config: KimaiClientConfig): Promise<KimaiProject[]>;
  export function fetchKimaiActivities(config: KimaiClientConfig): Promise<KimaiActivity[]>;
  export function fetchKimaiTimesheets(config: KimaiClientConfig, begin: Date, end: Date): Promise<KimaiTimesheet[]>;
  export function createKimaiTimesheet(config: KimaiClientConfig, entry: { begin: string; end: string; project: number; activity: number; description: string }): Promise<KimaiTimesheet>;
  ```
- Note: Kimai's exact auth header and field names should be confirmed against the live instance's `GET /api/doc.json` (with a real token) before first real run — this client assumes the documented Kimai 2.x contract (`Authorization: Bearer <token>`, `begin`/`end`/`project`/`activity` fields). Adjust field names here if the live instance differs; no other file needs to change.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/clients/kimaiClient.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/clients/kimaiClient.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/clients/kimaiClient.ts
export interface KimaiClientConfig {
  baseUrl: string;
  token: string;
}
export interface KimaiProject {
  id: number;
  name: string;
}
export interface KimaiActivity {
  id: number;
  name: string;
}
export interface KimaiTimesheet {
  id: number;
  begin: string;
  end: string;
  project: number;
  activity: number;
}

function headers(config: KimaiClientConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
}

export async function testKimaiConnection(config: KimaiClientConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseUrl}/api/projects`, { headers: headers(config) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchKimaiProjects(config: KimaiClientConfig): Promise<KimaiProject[]> {
  const res = await fetch(`${config.baseUrl}/api/projects`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai projects request failed: ${res.status}`);
  return res.json();
}

export async function fetchKimaiActivities(config: KimaiClientConfig): Promise<KimaiActivity[]> {
  const res = await fetch(`${config.baseUrl}/api/activities`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai activities request failed: ${res.status}`);
  return res.json();
}

export async function fetchKimaiTimesheets(
  config: KimaiClientConfig,
  begin: Date,
  end: Date
): Promise<KimaiTimesheet[]> {
  const url = `${config.baseUrl}/api/timesheets?begin=${begin.toISOString()}&end=${end.toISOString()}&size=1000`;
  const res = await fetch(url, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai timesheets request failed: ${res.status}`);
  return res.json();
}

export async function createKimaiTimesheet(
  config: KimaiClientConfig,
  entry: { begin: string; end: string; project: number; activity: number; description: string }
): Promise<KimaiTimesheet> {
  const res = await fetch(`${config.baseUrl}/api/timesheets`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Kimai timesheet creation failed: ${res.status} ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/clients/kimaiClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clients/kimaiClient.ts tests/clients/kimaiClient.test.ts
git commit -m "feat: add Kimai REST API client"
```

---

## Task 7: GitHub API client

**Files:**
- Create: `src/clients/githubClient.ts`
- Test: `tests/clients/githubClient.test.ts`

**Interfaces:**
- Consumes: `ActivityEvent` from `src/shared/types.ts`.
- Produces:
  ```ts
  export interface GithubClientConfig { token: string; }
  export function testGithubConnection(config: GithubClientConfig): Promise<boolean>;
  export function fetchGithubActivity(config: GithubClientConfig, since: Date, until: Date): Promise<ActivityEvent[]>;
  ```
- Implementation note: uses `GET /users/{username}/events` (the authenticated user's activity timeline — pushes, PR events, reviews, issue comments) rather than crawling every repo individually. This endpoint covers roughly the last 90 days / 300 events, which is enough for "fill in last month."

- [ ] **Step 1: Write the failing tests**

```ts
// tests/clients/githubClient.test.ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/clients/githubClient.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/clients/githubClient.ts
import type { ActivityEvent } from "../shared/types";

export interface GithubClientConfig {
  token: string;
}

interface GithubEvent {
  type: string;
  created_at: string;
  repo: { name: string };
}

const RELEVANT_EVENT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "PullRequestReviewEvent",
  "PullRequestReviewCommentEvent",
  "IssueCommentEvent",
]);

function headers(config: GithubClientConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
  };
}

async function fetchGithubUsername(config: GithubClientConfig): Promise<string> {
  const res = await fetch("https://api.github.com/user", { headers: headers(config) });
  if (!res.ok) throw new Error(`GitHub /user request failed: ${res.status}`);
  const body = (await res.json()) as { login: string };
  return body.login;
}

export async function testGithubConnection(config: GithubClientConfig): Promise<boolean> {
  try {
    await fetchGithubUsername(config);
    return true;
  } catch {
    return false;
  }
}

export async function fetchGithubActivity(
  config: GithubClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const username = await fetchGithubUsername(config);
  const events: ActivityEvent[] = [];

  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/users/${username}/events?per_page=100&page=${page}`,
      { headers: headers(config) }
    );
    if (!res.ok) throw new Error(`GitHub events request failed: ${res.status}`);
    const batch = (await res.json()) as GithubEvent[];
    if (batch.length === 0) break;

    let reachedTooOld = false;
    for (const evt of batch) {
      const ts = new Date(evt.created_at);
      if (ts < since) {
        reachedTooOld = true;
        break; // events are reverse-chronological
      }
      if (ts > until) continue;
      if (!RELEVANT_EVENT_TYPES.has(evt.type)) continue;
      events.push({ projectKey: `github:${evt.repo.name}`, timestamp: evt.created_at, source: "github" });
    }
    if (reachedTooOld) break;
  }

  return events;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/clients/githubClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clients/githubClient.ts tests/clients/githubClient.test.ts
git commit -m "feat: add GitHub activity client"
```

---

## Task 8: Jira API client

**Files:**
- Create: `src/clients/jiraClient.ts`
- Test: `tests/clients/jiraClient.test.ts`

**Interfaces:**
- Consumes: `ActivityEvent` from `src/shared/types.ts`.
- Produces:
  ```ts
  export interface JiraClientConfig { baseUrl: string; email: string; token: string; }
  export function testJiraConnection(config: JiraClientConfig): Promise<boolean>;
  export function fetchJiraActivity(config: JiraClientConfig, since: Date, until: Date): Promise<ActivityEvent[]>;
  ```
- Covers, per the spec: status changes, comments, and ticket creation by the authenticated user, in `[since, until]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/clients/jiraClient.test.ts
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
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ accountId: "acc-1" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          total: 1,
          issues: [
            {
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
      { projectKey: "jira:PROJ", timestamp: "2026-01-05T09:00:00.000+0000", source: "jira" },
      { projectKey: "jira:PROJ", timestamp: "2026-01-06T10:00:00.000+0000", source: "jira" },
      { projectKey: "jira:PROJ", timestamp: "2026-01-07T12:00:00.000+0000", source: "jira" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/clients/jiraClient.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/clients/jiraClient.ts
import type { ActivityEvent } from "../shared/types";

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  token: string;
}

interface JiraChangelogItem {
  field: string;
}
interface JiraChangelogHistory {
  author: { accountId: string };
  created: string;
  items: JiraChangelogItem[];
}
interface JiraComment {
  author: { accountId: string };
  created: string;
}
interface JiraIssue {
  fields: {
    project: { key: string };
    created: string;
    reporter?: { accountId: string };
    comment?: { comments: JiraComment[] };
  };
  changelog?: { histories: JiraChangelogHistory[] };
}
interface JiraSearchResponse {
  total: number;
  issues: JiraIssue[];
}

function headers(config: JiraClientConfig): HeadersInit {
  const basic = Buffer.from(`${config.email}:${config.token}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
  };
}

async function fetchJiraAccountId(config: JiraClientConfig): Promise<string> {
  const res = await fetch(`${config.baseUrl}/rest/api/3/myself`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Jira /myself request failed: ${res.status}`);
  const body = (await res.json()) as { accountId: string };
  return body.accountId;
}

export async function testJiraConnection(config: JiraClientConfig): Promise<boolean> {
  try {
    await fetchJiraAccountId(config);
    return true;
  } catch {
    return false;
  }
}

function inRange(iso: string, since: Date, until: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= until.getTime();
}

function jiraDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchJiraActivity(
  config: JiraClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const accountId = await fetchJiraAccountId(config);
  const jql = `(reporter = currentUser() OR assignee = currentUser()) AND updated >= "${jiraDate(since)}" AND updated <= "${jiraDate(until)}"`;
  const events: ActivityEvent[] = [];

  let startAt = 0;
  const maxResults = 50;
  while (true) {
    const url =
      `${config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}` +
      `&expand=changelog&fields=project,created,reporter,comment&startAt=${startAt}&maxResults=${maxResults}`;
    const res = await fetch(url, { headers: headers(config) });
    if (!res.ok) throw new Error(`Jira search request failed: ${res.status}`);
    const data = (await res.json()) as JiraSearchResponse;

    for (const issue of data.issues) {
      const projectKey = `jira:${issue.fields.project.key}`;

      if (
        issue.fields.reporter?.accountId === accountId &&
        inRange(issue.fields.created, since, until)
      ) {
        events.push({ projectKey, timestamp: issue.fields.created, source: "jira" });
      }

      for (const comment of issue.fields.comment?.comments ?? []) {
        if (comment.author.accountId !== accountId) continue;
        if (!inRange(comment.created, since, until)) continue;
        events.push({ projectKey, timestamp: comment.created, source: "jira" });
      }

      for (const history of issue.changelog?.histories ?? []) {
        if (history.author.accountId !== accountId) continue;
        if (!inRange(history.created, since, until)) continue;
        if (!history.items.some((i) => i.field === "status")) continue;
        events.push({ projectKey, timestamp: history.created, source: "jira" });
      }
    }

    startAt += data.issues.length;
    if (data.issues.length === 0 || startAt >= data.total) break;
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/clients/jiraClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clients/jiraClient.ts tests/clients/jiraClient.test.ts
git commit -m "feat: add Jira activity client"
```

---

## Task 9: Settings routes

**Files:**
- Modify: `src/app.ts`
- Create: `src/routes/settingsRoutes.ts`
- Test: `tests/routes/settingsRoutes.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`saveConfig` (Task 3), `testKimaiConnection` (Task 6), `testGithubConnection` (Task 7), `testJiraConnection` (Task 8), `AppConfig` (Task 2).
- Produces: `createSettingsRoutes(deps: SettingsDeps): Hono` mounted at `/api/settings`, where:
  ```ts
  export interface SettingsDeps {
    loadConfig: () => Promise<AppConfig | null>;
    saveConfig: (config: AppConfig) => Promise<void>;
    testKimaiConnection: (c: AppConfig["kimai"]) => Promise<boolean>;
    testGithubConnection: (c: AppConfig["github"]) => Promise<boolean>;
    testJiraConnection: (c: AppConfig["jira"]) => Promise<boolean>;
  }
  ```
  `GET /` returns the stored config (or `null`). `POST /` saves a config. `POST /test` runs all three connection tests against a config payload and returns `{ kimai: boolean, github: boolean, jira: boolean }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/routes/settingsRoutes.test.ts
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
      testJiraConnection: async () => true,
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
    expect(await res.json()).toEqual({ kimai: true, github: false, jira: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/settingsRoutes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation and wire it into the app**

```ts
// src/routes/settingsRoutes.ts
import { Hono } from "hono";
import type { AppConfig } from "../shared/types";

export interface SettingsDeps {
  loadConfig: () => Promise<AppConfig | null>;
  saveConfig: (config: AppConfig) => Promise<void>;
  testKimaiConnection: (c: AppConfig["kimai"]) => Promise<boolean>;
  testGithubConnection: (c: AppConfig["github"]) => Promise<boolean>;
  testJiraConnection: (c: AppConfig["jira"]) => Promise<boolean>;
}

export function createSettingsRoutes(deps: SettingsDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await deps.loadConfig()));

  routes.post("/", async (c) => {
    const config = await c.req.json<AppConfig>();
    await deps.saveConfig(config);
    return c.json({ ok: true });
  });

  routes.post("/test", async (c) => {
    const config = await c.req.json<AppConfig>();
    const [kimai, github, jira] = await Promise.all([
      deps.testKimaiConnection(config.kimai),
      deps.testGithubConnection(config.github),
      deps.testJiraConnection(config.jira),
    ]);
    return c.json({ kimai, github, jira });
  });

  return routes;
}
```

```ts
// src/app.ts
import { Hono } from "hono";
import { createSettingsRoutes } from "./routes/settingsRoutes";
import { loadConfig, saveConfig } from "./config";
import { testKimaiConnection } from "./clients/kimaiClient";
import { testGithubConnection } from "./clients/githubClient";
import { testJiraConnection } from "./clients/jiraClient";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route(
    "/api/settings",
    createSettingsRoutes({ loadConfig, saveConfig, testKimaiConnection, testGithubConnection, testJiraConnection })
  );
  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/routes/settingsRoutes.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/settingsRoutes.ts src/app.ts tests/routes/settingsRoutes.test.ts
git commit -m "feat: add settings routes"
```

---

## Task 10: Mapping routes (including Kimai project/activity options)

**Files:**
- Modify: `src/app.ts`
- Create: `src/routes/mappingRoutes.ts`
- Test: `tests/routes/mappingRoutes.test.ts`

**Interfaces:**
- Consumes: `loadMapping`/`saveMappingEntry` (Task 4), `loadConfig` (Task 3), `fetchKimaiProjects`/`fetchKimaiActivities` (Task 6).
- Produces: `createMappingRoutes(deps: MappingDeps): Hono` mounted at `/api/mapping`, where:
  ```ts
  export interface MappingDeps {
    loadMapping: () => Promise<MappingStore>;
    saveMappingEntry: (projectKey: string, entry: MappingEntry) => Promise<MappingStore>;
    loadConfig: () => Promise<AppConfig | null>;
    fetchKimaiProjects: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
    fetchKimaiActivities: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
  }
  ```
  `GET /` returns the full mapping store. `POST /` takes `{ projectKey, entry }` and saves it. `GET /kimai-options` returns `{ projects, activities }` for populating the mapping UI's dropdowns (404s with `{ error: "not_configured" }` if no config yet).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/routes/mappingRoutes.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/mappingRoutes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation and wire it into the app**

```ts
// src/routes/mappingRoutes.ts
import { Hono } from "hono";
import type { AppConfig, MappingEntry, MappingStore } from "../shared/types";

export interface MappingDeps {
  loadMapping: () => Promise<MappingStore>;
  saveMappingEntry: (projectKey: string, entry: MappingEntry) => Promise<MappingStore>;
  loadConfig: () => Promise<AppConfig | null>;
  fetchKimaiProjects: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
  fetchKimaiActivities: (c: AppConfig["kimai"]) => Promise<{ id: number; name: string }[]>;
}

export function createMappingRoutes(deps: MappingDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await deps.loadMapping()));

  routes.post("/", async (c) => {
    const { projectKey, entry } = await c.req.json<{ projectKey: string; entry: MappingEntry }>();
    const mapping = await deps.saveMappingEntry(projectKey, entry);
    return c.json(mapping);
  });

  routes.get("/kimai-options", async (c) => {
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);
    const [projects, activities] = await Promise.all([
      deps.fetchKimaiProjects(config.kimai),
      deps.fetchKimaiActivities(config.kimai),
    ]);
    return c.json({ projects, activities });
  });

  return routes;
}
```

```ts
// src/app.ts (add to existing file)
import { createMappingRoutes } from "./routes/mappingRoutes";
import { loadMapping, saveMappingEntry } from "./mapping";
import { fetchKimaiProjects, fetchKimaiActivities } from "./clients/kimaiClient";

// inside createApp(), after the settings route:
app.route(
  "/api/mapping",
  createMappingRoutes({ loadMapping, saveMappingEntry, loadConfig, fetchKimaiProjects, fetchKimaiActivities })
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/routes/mappingRoutes.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/mappingRoutes.ts src/app.ts tests/routes/mappingRoutes.test.ts
git commit -m "feat: add mapping routes and Kimai options endpoint"
```

---

## Task 11: Generate route (orchestration)

**Files:**
- Modify: `src/app.ts`
- Create: `src/routes/generateRoutes.ts`
- Test: `tests/routes/generateRoutes.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 3), `loadMapping` (Task 4), `fetchGithubActivity` (Task 7), `fetchJiraActivity` (Task 8), `fetchKimaiTimesheets` (Task 6), `aggregateDay` (Task 5), `toLocalDateString`/`eachLocalDateInMonth` (Task 2), `MonthlySummary`/`SummaryRow` (Task 2).
- Produces: `createGenerateRoutes(deps: GenerateDeps): Hono` mounted at `/api/generate`. `POST /` takes `{ month: "YYYY-MM" }`, returns a `MonthlySummary`.

This task covers Review Focus items 1, 3, and 4 (empty month, idempotent skip, local-timezone bucketing).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/routes/generateRoutes.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/generateRoutes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation and wire it into the app**

```ts
// src/routes/generateRoutes.ts
import { Hono } from "hono";
import type { ActivityEvent, AppConfig, MappingStore, MonthlySummary, SummaryRow } from "../shared/types";
import { aggregateDay } from "../aggregation/dayAggregator";
import { toLocalDateString, eachLocalDateInMonth } from "../shared/dateUtils";

export interface GenerateDeps {
  loadConfig: () => Promise<AppConfig | null>;
  loadMapping: () => Promise<MappingStore>;
  fetchGithubActivity: (c: AppConfig["github"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchJiraActivity: (c: AppConfig["jira"], since: Date, until: Date) => Promise<ActivityEvent[]>;
  fetchKimaiTimesheets: (
    c: AppConfig["kimai"],
    since: Date,
    until: Date
  ) => Promise<{ id: number; begin: string; end: string; project: number; activity: number }[]>;
}

const TIMEZONE_BUFFER_MS = 3 * 60 * 60 * 1000; // covers Europe/Warsaw's UTC+1 / UTC+2 offset

function groupByLocalDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const map = new Map<string, ActivityEvent[]>();
  for (const evt of events) {
    const day = toLocalDateString(evt.timestamp);
    const list = map.get(day) ?? [];
    list.push(evt);
    map.set(day, list);
  }
  return map;
}

export function createGenerateRoutes(deps: GenerateDeps) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const { month } = await c.req.json<{ month: string }>();
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);
    const mapping = await deps.loadMapping();

    const [year, monthNum] = month.split("-").map(Number);
    const since = new Date(Date.UTC(year, monthNum - 1, 1) - TIMEZONE_BUFFER_MS);
    const until = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59) + TIMEZONE_BUFFER_MS);

    const [githubEvents, jiraEvents, existingTimesheets] = await Promise.all([
      deps.fetchGithubActivity(config.github, since, until),
      deps.fetchJiraActivity(config.jira, since, until),
      deps.fetchKimaiTimesheets(config.kimai, since, until),
    ]);

    const daysWithExistingEntries = new Set(existingTimesheets.map((t) => toLocalDateString(t.begin)));
    const eventsByDay = groupByLocalDay([...githubEvents, ...jiraEvents]);

    const missingMappings = new Set<string>();
    const rows: SummaryRow[] = [];

    for (const date of eachLocalDateInMonth(month)) {
      if (daysWithExistingEntries.has(date)) continue;

      const dayEvents = eventsByDay.get(date) ?? [];
      for (const evt of dayEvents) {
        if (!mapping[evt.projectKey]) missingMappings.add(evt.projectKey);
      }

      if (dayEvents.length === 0) {
        rows.push({
          date,
          projectKey: null,
          kimaiProjectId: null,
          kimaiActivityId: null,
          beginIso: null,
          endIso: null,
          hours: 0,
          description: "",
          status: "manual",
        });
        continue;
      }

      for (const block of aggregateDay(dayEvents)) {
        const entry = mapping[block.projectKey];
        rows.push({
          date,
          projectKey: block.projectKey,
          kimaiProjectId: entry?.kimaiProjectId ?? null,
          kimaiActivityId: entry?.kimaiActivityId ?? null,
          beginIso: block.beginIso,
          endIso: block.endIso,
          hours: block.hours,
          description: block.projectKey,
          status: "auto",
        });
      }
    }

    const summary: MonthlySummary = { month, rows, missingMappings: [...missingMappings] };
    return c.json(summary);
  });

  return routes;
}
```

```ts
// src/app.ts (add to existing file)
import { createGenerateRoutes } from "./routes/generateRoutes";
import { fetchGithubActivity } from "./clients/githubClient";
import { fetchJiraActivity } from "./clients/jiraClient";
import { fetchKimaiTimesheets } from "./clients/kimaiClient";

// inside createApp(), after the mapping route:
app.route(
  "/api/generate",
  createGenerateRoutes({ loadConfig, loadMapping, fetchGithubActivity, fetchJiraActivity, fetchKimaiTimesheets })
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/routes/generateRoutes.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/generateRoutes.ts src/app.ts tests/routes/generateRoutes.test.ts
git commit -m "feat: add generate route orchestrating monthly summary"
```

---

## Task 12: Submit route

**Files:**
- Modify: `src/app.ts`
- Create: `src/routes/submitRoutes.ts`
- Test: `tests/routes/submitRoutes.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 3), `createKimaiTimesheet` (Task 6), `SummaryRow`/`SubmitResult` (Task 2).
- Produces: `createSubmitRoutes(deps: SubmitDeps): Hono` mounted at `/api/submit`. `POST /` takes `{ rows: SummaryRow[] }`, returns `{ results: SubmitResult[] }`.

This task covers Review Focus item 5 (one failing row must not abort the rest).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/routes/submitRoutes.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/routes/submitRoutes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation and wire it into the app**

```ts
// src/routes/submitRoutes.ts
import { Hono } from "hono";
import type { AppConfig, SubmitResult, SummaryRow } from "../shared/types";

export interface SubmitDeps {
  loadConfig: () => Promise<AppConfig | null>;
  createKimaiTimesheet: (
    c: AppConfig["kimai"],
    entry: { begin: string; end: string; project: number; activity: number; description: string }
  ) => Promise<unknown>;
}

export function createSubmitRoutes(deps: SubmitDeps) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const { rows } = await c.req.json<{ rows: SummaryRow[] }>();
    const config = await deps.loadConfig();
    if (!config) return c.json({ error: "not_configured" }, 400);

    const results: SubmitResult[] = [];
    for (const row of rows) {
      if (row.hours <= 0) continue;
      if (!row.kimaiProjectId || !row.kimaiActivityId || !row.beginIso || !row.endIso) {
        results.push({ date: row.date, projectKey: row.projectKey, success: false, error: "missing_mapping_or_time" });
        continue;
      }
      try {
        await deps.createKimaiTimesheet(config.kimai, {
          begin: row.beginIso,
          end: row.endIso,
          project: row.kimaiProjectId,
          activity: row.kimaiActivityId,
          description: row.description,
        });
        results.push({ date: row.date, projectKey: row.projectKey, success: true });
      } catch (err) {
        results.push({ date: row.date, projectKey: row.projectKey, success: false, error: (err as Error).message });
      }
    }
    return c.json({ results });
  });

  return routes;
}
```

```ts
// src/app.ts (add to existing file)
import { createSubmitRoutes } from "./routes/submitRoutes";
import { createKimaiTimesheet } from "./clients/kimaiClient";

// inside createApp(), after the generate route:
app.route("/api/submit", createSubmitRoutes({ loadConfig, createKimaiTimesheet }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/routes/submitRoutes.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/submitRoutes.ts src/app.ts tests/routes/submitRoutes.test.ts
git commit -m "feat: add submit route with per-row error isolation"
```

---

## Task 13: Static file serving for the frontend build

**Files:**
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: Hono's `serveStatic` (from `hono/bun`).
- Produces: `createApp()` now also serves `web/dist` for any unmatched route, so the compiled binary can serve the built frontend.

`web/dist` is gitignored (it's Vite's build output, produced for real in Task 19) — the test below creates and removes its own fixture file instead of relying on a committed one.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app.test.ts (add imports and this describe block to the existing file)
import { mkdir, writeFile, rm } from "node:fs/promises";

describe("static fallback", () => {
  beforeAll(async () => {
    await mkdir("./web/dist", { recursive: true });
    await writeFile("./web/dist/index.html", "<!doctype html><html><body>kimaj-se</body></html>");
  });

  afterAll(async () => {
    await rm("./web/dist", { recursive: true, force: true });
  });

  it("falls back to the SPA index for unknown non-API routes", async () => {
    const app = createApp();
    const res = await app.request("/some/frontend/route");
    expect(res.status).not.toBe(404);
  });
});
```

(Add `beforeAll, afterAll` to the existing `import { describe, it, expect } from "bun:test";` line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/app.test.ts`
Expected: FAIL — 404, because there is no static handler yet

- [ ] **Step 3: Wire static serving**

```ts
// src/app.ts (add to existing file, after all app.route(...) calls)
import { serveStatic } from "hono/bun";

// after the last app.route(...) call:
app.use("/*", serveStatic({ root: "./web/dist" }));
app.notFound(async (c) => c.html(await Bun.file("./web/dist/index.html").text()));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.ts tests/app.test.ts
git commit -m "feat: serve built frontend as a static fallback"
```

---

## Task 14: Frontend scaffolding, API client, and app shell

**Files:**
- Create: `web/index.html`
- Create: `vite.config.ts`
- Create: `web/src/main.tsx`
- Create: `web/src/api.ts`
- Create: `web/src/App.tsx`

No automated test for this task (UI wiring, per the spec's no-e2e decision) — verified by a manual dev-server run in Step 3.

- [ ] **Step 1: Write the Vite config and HTML entry**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  server: {
    fs: { allow: [resolve(__dirname)] },
    proxy: { "/api": "http://localhost:3001" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

```html
<!-- web/index.html -->
<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <title>kimaj-se</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the API client**

```ts
// web/src/api.ts
import type { AppConfig, MappingEntry, MappingStore, MonthlySummary, SubmitResult, SummaryRow } from "@shared/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  getConfig: () => fetch("/api/settings").then((r) => json<AppConfig | null>(r)),
  saveConfig: (config: AppConfig) =>
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then((r) => json<{ ok: true }>(r)),
  testConnections: (config: AppConfig) =>
    fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then((r) => json<{ kimai: boolean; github: boolean; jira: boolean }>(r)),

  getMapping: () => fetch("/api/mapping").then((r) => json<MappingStore>(r)),
  saveMappingEntry: (projectKey: string, entry: MappingEntry) =>
    fetch("/api/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey, entry }) }).then((r) => json<MappingStore>(r)),
  getKimaiOptions: () => fetch("/api/mapping/kimai-options").then((r) => json<{ projects: { id: number; name: string }[]; activities: { id: number; name: string }[] }>(r)),

  generate: (month: string) =>
    fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) }).then((r) => json<MonthlySummary>(r)),

  submit: (rows: SummaryRow[]) =>
    fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }).then((r) => json<{ results: SubmitResult[] }>(r)),
};
```

- [ ] **Step 3: Write the app shell and main entry, then verify manually**

```tsx
// web/src/App.tsx
import { useState } from "react";
import type { MonthlySummary } from "@shared/types";
import { SettingsPage } from "./pages/SettingsPage";
import { HomePage } from "./pages/HomePage";
import { MappingPage } from "./pages/MappingPage";
import { SummaryPage } from "./pages/SummaryPage";
import { api } from "./api";

type View =
  | { name: "settings" }
  | { name: "home" }
  | { name: "mapping"; month: string; missingMappings: string[] }
  | { name: "summary"; summary: MonthlySummary };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });

  if (view.name === "settings") {
    return <SettingsPage onSaved={() => setView({ name: "home" })} />;
  }
  if (view.name === "home") {
    return (
      <HomePage
        onOpenSettings={() => setView({ name: "settings" })}
        onGenerated={(summary) =>
          setView(
            summary.missingMappings.length > 0
              ? { name: "mapping", month: summary.month, missingMappings: summary.missingMappings }
              : { name: "summary", summary }
          )
        }
      />
    );
  }
  if (view.name === "mapping") {
    return (
      <MappingPage
        missingMappings={view.missingMappings}
        onResolved={async () => setView({ name: "summary", summary: await api.generate(view.month) })}
      />
    );
  }
  return <SummaryPage summary={view.summary} onBack={() => setView({ name: "home" })} />;
}
```

```tsx
// web/src/main.tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

(`SettingsPage`, `HomePage`, `MappingPage`, `SummaryPage` are created in Tasks 15-18; this task's manual check runs after Task 15 provides at least one real page. For now, add a temporary inline placeholder for the three not-yet-built pages so the app compiles: create empty stub files exporting a function that returns `<div>TODO</div>` for `MappingPage` and `SummaryPage`, and for `HomePage`/`SettingsPage` too, to be replaced task-by-task.)

```tsx
// web/src/pages/SettingsPage.tsx (temporary stub, replaced in Task 15)
export function SettingsPage(_props: { onSaved: () => void }) {
  return <div>Settings TODO</div>;
}
```

```tsx
// web/src/pages/HomePage.tsx (temporary stub, replaced in Task 16)
import type { MonthlySummary } from "@shared/types";
export function HomePage(_props: { onOpenSettings: () => void; onGenerated: (s: MonthlySummary) => void }) {
  return <div>Home TODO</div>;
}
```

```tsx
// web/src/pages/MappingPage.tsx (temporary stub, replaced in Task 17)
export function MappingPage(_props: { missingMappings: string[]; onResolved: () => void }) {
  return <div>Mapping TODO</div>;
}
```

```tsx
// web/src/pages/SummaryPage.tsx (temporary stub, replaced in Task 18)
import type { MonthlySummary } from "@shared/types";
export function SummaryPage(_props: { summary: MonthlySummary; onBack: () => void }) {
  return <div>Summary TODO</div>;
}
```

Run: `bun run dev:server` in one terminal, `bun run dev:web` in another, then open the printed Vite URL in a browser.
Expected: page loads showing "Home TODO" with no console errors.

- [ ] **Step 4: N/A (manual verification is the test for this task)**

- [ ] **Step 5: Commit**

```bash
git add web/index.html vite.config.ts web/src/main.tsx web/src/api.ts web/src/App.tsx web/src/pages
git commit -m "feat: scaffold React frontend shell and API client"
```

---

## Task 15: Settings page

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `api.getConfig`, `api.saveConfig`, `api.testConnections` (Task 14), `AppConfig` (Task 2).
- Produces: `SettingsPage(props: { onSaved: () => void })`.

- [ ] **Step 1: Replace the stub with the real form**

```tsx
// web/src/pages/SettingsPage.tsx
import { useEffect, useState } from "react";
import type { AppConfig } from "@shared/types";
import { api } from "../api";

const EMPTY_CONFIG: AppConfig = {
  kimai: { baseUrl: "", token: "" },
  github: { token: "" },
  jira: { baseUrl: "", email: "", token: "" },
};

export function SettingsPage({ onSaved }: { onSaved: () => void }) {
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<{ kimai: boolean; github: boolean; jira: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then((c) => c && setConfig(c));
  }, []);

  async function handleTest() {
    setStatus(await api.testConnections(config));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveConfig(config);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Ustawienia</h1>

      <fieldset>
        <legend>Kimai</legend>
        <input placeholder="Kimai URL" value={config.kimai.baseUrl} onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, baseUrl: e.target.value } })} />
        <input placeholder="Kimai token" value={config.kimai.token} onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, token: e.target.value } })} />
        {status && <span>{status.kimai ? "OK" : "Blad"}</span>}
      </fieldset>

      <fieldset>
        <legend>GitHub</legend>
        <input placeholder="GitHub token" value={config.github.token} onChange={(e) => setConfig({ ...config, github: { token: e.target.value } })} />
        {status && <span>{status.github ? "OK" : "Blad"}</span>}
      </fieldset>

      <fieldset>
        <legend>Jira</legend>
        <input placeholder="Jira URL" value={config.jira.baseUrl} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, baseUrl: e.target.value } })} />
        <input placeholder="Jira email" value={config.jira.email} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, email: e.target.value } })} />
        <input placeholder="Jira token" value={config.jira.token} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, token: e.target.value } })} />
        {status && <span>{status.jira ? "OK" : "Blad"}</span>}
      </fieldset>

      <button onClick={handleTest}>Testuj polaczenia</button>
      <button onClick={handleSave} disabled={saving}>Zapisz</button>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `bun run dev:server` and `bun run dev:web`, open the app, fill in test values, click "Testuj polaczenia" (expect OK/Blad next to each section against a mock or real backend), click "Zapisz", confirm `~/.kimaj-se/config.json` (or `$KIMAJ_SE_HOME/config.json` if set) now contains the values.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/SettingsPage.tsx
git commit -m "feat: implement Settings page"
```

---

## Task 16: Home page (month picker + generate)

**Files:**
- Modify: `web/src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: `api.generate` (Task 14), `MonthlySummary` (Task 2).
- Produces: `HomePage(props: { onOpenSettings: () => void; onGenerated: (summary: MonthlySummary) => void })`.

- [ ] **Step 1: Replace the stub with the real page**

```tsx
// web/src/pages/HomePage.tsx
import { useState } from "react";
import type { MonthlySummary } from "@shared/types";
import { api } from "../api";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function HomePage({
  onOpenSettings,
  onGenerated,
}: {
  onOpenSettings: () => void;
  onGenerated: (summary: MonthlySummary) => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      onGenerated(await api.generate(month));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>kimaj-se</h1>
      <button onClick={onOpenSettings}>Ustawienia</button>
      <div>
        <label>
          Miesiac:
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generuje..." : "Generuj"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

With the backend configured (Task 15) and pointed at a real or stubbed Kimai/GitHub/Jira, run both dev servers, pick a month, click "Generuj", confirm it navigates to the Mapping or Summary screen (still stubs at this point) without throwing.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/HomePage.tsx
git commit -m "feat: implement Home page with month picker"
```

---

## Task 17: Mapping resolution page

**Files:**
- Modify: `web/src/pages/MappingPage.tsx`

**Interfaces:**
- Consumes: `api.getKimaiOptions`, `api.saveMappingEntry` (Task 14).
- Produces: `MappingPage(props: { missingMappings: string[]; onResolved: () => void })`.

- [ ] **Step 1: Replace the stub with the real page**

```tsx
// web/src/pages/MappingPage.tsx
import { useEffect, useState } from "react";
import { api } from "../api";

export function MappingPage({
  missingMappings,
  onResolved,
}: {
  missingMappings: string[];
  onResolved: () => void;
}) {
  const [options, setOptions] = useState<{ projects: { id: number; name: string }[]; activities: { id: number; name: string }[] } | null>(null);
  const [choices, setChoices] = useState<Record<string, { kimaiProjectId: number; kimaiActivityId: number }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getKimaiOptions().then(setOptions);
  }, []);

  function setChoice(projectKey: string, field: "kimaiProjectId" | "kimaiActivityId", value: number) {
    setChoices((prev) => ({
      ...prev,
      [projectKey]: { kimaiProjectId: 0, kimaiActivityId: 0, ...prev[projectKey], [field]: value },
    }));
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const projectKey of missingMappings) {
        const choice = choices[projectKey];
        if (!choice?.kimaiProjectId || !choice?.kimaiActivityId) continue;
        await api.saveMappingEntry(projectKey, choice);
      }
      onResolved();
    } finally {
      setSaving(false);
    }
  }

  if (!options) return <div>Ladowanie...</div>;

  const allChosen = missingMappings.every((key) => choices[key]?.kimaiProjectId && choices[key]?.kimaiActivityId);

  return (
    <div>
      <h1>Przypisz projekty</h1>
      {missingMappings.map((projectKey) => (
        <div key={projectKey}>
          <span>{projectKey}</span>
          <select onChange={(e) => setChoice(projectKey, "kimaiProjectId", Number(e.target.value))} defaultValue="">
            <option value="" disabled>Projekt Kimai</option>
            {options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select onChange={(e) => setChoice(projectKey, "kimaiActivityId", Number(e.target.value))} defaultValue="">
            <option value="" disabled>Aktywnosc Kimai</option>
            {options.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      ))}
      <button onClick={handleSaveAll} disabled={!allChosen || saving}>Zapisz mapowanie i kontynuuj</button>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Trigger a generate for a month with an unmapped repo/project, confirm the Mapping screen lists it, assign project+activity for each, click continue, confirm it lands on the Summary screen (still a stub) and that `~/.kimaj-se/mapping.json` now has the new entries.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/MappingPage.tsx
git commit -m "feat: implement mapping resolution page"
```

---

## Task 18: Summary page (edit + submit)

**Files:**
- Modify: `web/src/pages/SummaryPage.tsx`

**Interfaces:**
- Consumes: `api.submit` (Task 14), `MonthlySummary`, `SummaryRow`, `SubmitResult` (Task 2).
- Produces: `SummaryPage(props: { summary: MonthlySummary; onBack: () => void })`.

- [ ] **Step 1: Replace the stub with the real page**

```tsx
// web/src/pages/SummaryPage.tsx
import { useState } from "react";
import type { MonthlySummary, SubmitResult, SummaryRow } from "@shared/types";
import { api } from "../api";

export function SummaryPage({ summary, onBack }: { summary: MonthlySummary; onBack: () => void }) {
  const [rows, setRows] = useState<SummaryRow[]>(summary.rows);
  const [results, setResults] = useState<SubmitResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(index: number, patch: Partial<SummaryRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { results } = await api.submit(rows);
      setResults(results);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Podsumowanie {summary.month}</h1>
      <button onClick={onBack}>Wstecz</button>
      <table>
        <thead>
          <tr>
            <th>Dzien</th>
            <th>Projekt</th>
            <th>Godziny</th>
            <th>Opis</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const result = results?.find((r) => r.date === row.date && r.projectKey === row.projectKey);
            return (
              <tr key={`${row.date}-${row.projectKey ?? "manual"}-${i}`}>
                <td>{row.date}</td>
                <td>{row.projectKey ?? "-"}</td>
                <td>
                  <input
                    type="number"
                    step={0.5}
                    value={row.hours}
                    onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                  />
                </td>
                <td>{result ? (result.success ? "Wyslano" : `Blad: ${result.error}`) : row.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Wysylam..." : "Wyslij do Kimai"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

From a generated summary, edit a row's hours/description, click "Wyslij do Kimai" against a real or test Kimai instance, confirm each row shows "Wyslano" or its own error message, and confirm the entries appear in Kimai for a successful run.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/SummaryPage.tsx
git commit -m "feat: implement editable summary page with submit"
```

---

## Task 19: Packaging into a single binary

**Files:**
- Modify: `package.json` (scripts already added in Task 1 — this task verifies them end-to-end)
- Modify: `.gitignore` (already covers `dist/` and `web/dist/` from Task 1)

- [ ] **Step 1: Build the frontend and the binary**

Run: `bun run build`
Expected: `web/dist/index.html` and bundled JS/CSS exist; `dist/kimaj-se` executable exists.

- [ ] **Step 2: Run the binary standalone and verify it serves the real app**

Run: `KIMAJ_SE_HOME=$(mktemp -d) ./dist/kimaj-se`
Expected: console prints `kimaj-se running at http://localhost:<port>`, the default browser opens to that URL, and the Home page (not the placeholder text from Task 13) loads with no 404s in the browser console/network tab.

- [ ] **Step 3: Confirm no local data or secrets are tracked by git**

Run: `git status --porcelain`
Expected: clean (only files intentionally staged/committed in earlier tasks); `~/.kimaj-se/` and `dist/` must not appear.

- [ ] **Step 4: Confirm the plan's final state**

No new tracked files are expected from Steps 1-3 (`dist/` and `web/dist/` are both gitignored build output). This step is a verification checkpoint, not a commit — implementation is complete once Steps 1-3 pass.
