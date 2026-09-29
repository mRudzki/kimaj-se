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
