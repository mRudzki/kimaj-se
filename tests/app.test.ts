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
