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
