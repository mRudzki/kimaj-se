export interface ActivityEvent {
  projectKey: string; // "github:owner/repo" or "jira:PROJECTKEY"
  timestamp: string; // ISO 8601 UTC
  source: "github" | "jira";
}

export interface DayBlock {
  projectKey: string;
  beginIso: string;
  endIso: string;
  hours: number;
}

export interface SummaryRow {
  date: string; // YYYY-MM-DD (local calendar day)
  projectKey: string | null;
  kimaiProjectId: number | null;
  kimaiActivityId: number | null;
  beginIso: string | null;
  endIso: string | null;
  hours: number;
  description: string;
  status: "auto" | "manual";
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  rows: SummaryRow[];
  missingMappings: string[]; // projectKeys with no mapping entry
}

export interface MappingEntry {
  kimaiProjectId: number;
  kimaiActivityId: number;
}

export type MappingStore = Record<string, MappingEntry>;

export interface AppConfig {
  kimai: { baseUrl: string; token: string };
  github: { token: string };
  jira: { baseUrl: string; email: string; token: string };
}

export interface SubmitResult {
  date: string;
  projectKey: string | null;
  success: boolean;
  error?: string;
}
