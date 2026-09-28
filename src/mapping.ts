import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { MappingEntry, MappingStore } from "./shared/types";

function appDir(): string {
  return process.env.KIMAJ_SE_HOME ?? join(homedir(), ".kimaj-se");
}

function mappingPath(): string {
  return join(appDir(), "mapping.json");
}

export async function loadMapping(): Promise<MappingStore> {
  try {
    const raw = await readFile(mappingPath(), "utf-8");
    return JSON.parse(raw) as MappingStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveMappingEntry(projectKey: string, entry: MappingEntry): Promise<MappingStore> {
  const mapping = await loadMapping();
  mapping[projectKey] = entry;
  await mkdir(appDir(), { recursive: true });
  await writeFile(mappingPath(), JSON.stringify(mapping, null, 2), "utf-8");
  return mapping;
}
