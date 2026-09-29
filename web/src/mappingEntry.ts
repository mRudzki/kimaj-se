import type { MappingEntry } from "@shared/types";

export type LocalEntry = { kimaiProjectId: number; kimaiActivityId: number; ignored: boolean; label?: string };

export function toLocalEntry(entry: MappingEntry): LocalEntry {
  const label = entry.label !== undefined ? { label: entry.label } : {};
  if ("ignored" in entry) return { kimaiProjectId: 0, kimaiActivityId: 0, ignored: true, ...label };
  return { kimaiProjectId: entry.kimaiProjectId, kimaiActivityId: entry.kimaiActivityId, ignored: false, ...label };
}

export function toMappingEntry(e: LocalEntry): MappingEntry {
  const label = e.label !== undefined ? { label: e.label } : {};
  return e.ignored
    ? { ignored: true, ...label }
    : { kimaiProjectId: e.kimaiProjectId, kimaiActivityId: e.kimaiActivityId, ...label };
}
