import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AppConfig } from "./shared/types";

function appDir(): string {
  return process.env.KIMAJ_SE_HOME ?? join(homedir(), ".kimaj-se");
}

function configPath(): string {
  return join(appDir(), "config.json");
}

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(appDir(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}
