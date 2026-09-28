import { describe, it, expect } from "bun:test";
import { resolveStaticRoot } from "../src/staticRoot";

describe("resolveStaticRoot", () => {
  it("prefers a 'web' directory next to the running executable, when it exists", () => {
    const root = resolveStaticRoot({
      execPath: "/Applications/kimaj-se/dist/kimaj-se",
      fallback: "./web/dist",
      exists: (p) => p === "/Applications/kimaj-se/dist/web",
    });
    expect(root).toBe("/Applications/kimaj-se/dist/web");
  });

  it("falls back to the dev-relative path when no directory sits beside the executable", () => {
    const root = resolveStaticRoot({
      execPath: "/opt/homebrew/bin/bun",
      fallback: "./web/dist",
      exists: () => false,
    });
    expect(root).toBe("./web/dist");
  });
});
