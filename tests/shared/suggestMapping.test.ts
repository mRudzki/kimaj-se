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
