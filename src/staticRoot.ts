import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

export function resolveStaticRoot(deps?: {
  execPath?: string;
  fallback?: string;
  exists?: (path: string) => boolean;
}): string {
  const execPath = deps?.execPath ?? process.execPath;
  const fallback = deps?.fallback ?? "./web/dist";
  const exists = deps?.exists ?? existsSync;

  const besideExecutable = join(dirname(execPath), "web");
  return exists(besideExecutable) ? besideExecutable : fallback;
}
