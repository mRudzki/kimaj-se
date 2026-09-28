import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createApp } from "../src/app";

describe("health check", () => {
  it("responds with ok", async () => {
    const app = createApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

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
