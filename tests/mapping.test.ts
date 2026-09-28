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
