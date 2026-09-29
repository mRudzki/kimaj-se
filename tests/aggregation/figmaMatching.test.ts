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
