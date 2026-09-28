import type { AppConfig, MappingEntry, MappingStore, MonthlySummary, SubmitResult, SummaryRow } from "@shared/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  getConfig: () => fetch("/api/settings").then((r) => json<AppConfig | null>(r)),
  saveConfig: (config: AppConfig) =>
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then((r) => json<{ ok: true }>(r)),
  testConnections: (config: AppConfig) =>
    fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then((r) => json<{ kimai: boolean; github: boolean; jira: boolean }>(r)),

  getMapping: () => fetch("/api/mapping").then((r) => json<MappingStore>(r)),
  saveMappingEntry: (projectKey: string, entry: MappingEntry) =>
    fetch("/api/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectKey, entry }) }).then((r) => json<MappingStore>(r)),
  getKimaiOptions: () => fetch("/api/mapping/kimai-options").then((r) => json<{ projects: { id: number; name: string }[]; activities: { id: number; name: string }[] }>(r)),

  generate: (month: string) =>
    fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) }).then((r) => json<MonthlySummary>(r)),

  submit: (rows: SummaryRow[]) =>
    fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }).then((r) => json<{ results: SubmitResult[] }>(r)),
};
