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
