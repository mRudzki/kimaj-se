export interface FigmaEventMeta {
  fileName: string;
  folderName: string; // Figma project (folder) the file lives in
  texts: string[]; // file name, version label/description or comment message — scanned for Jira keys
}

export interface ActivityEvent {
  projectKey: string; // "github:owner/repo", "jira:PROJECTKEY" or "figma:file:<fileKey>"
  timestamp: string; // ISO 8601 UTC
  source: "github" | "jira" | "figma";
  label?: string; // Jira issue key, GitHub PR title / branch name, or Figma file name
  meta?: FigmaEventMeta; // only set on Figma events
}

export interface DayBlock {
  projectKey: string;
  beginIso: string;
  endIso: string;
  hours: number;
  description: string;
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

export interface MappingHint {
  label: string; // "<folder> / <file>", shown instead of the raw key
  folderName: string;
  fileName: string;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  rows: SummaryRow[];
  missingMappings: string[]; // projectKeys with no mapping entry
  missingHints?: Record<string, MappingHint>; // readable names for some of the missing keys
  warnings?: string[]; // non-fatal problems, e.g. Figma could not be fetched
}

export type MappingEntry = ({ kimaiProjectId: number; kimaiActivityId: number } | { ignored: true }) & {
  label?: string; // human-readable name for keys that are not self-explanatory (Figma files)
};

export type MappingStore = Record<string, MappingEntry>;

export interface AppConfig {
  kimai: { baseUrl: string; token: string };
  github: { token: string };
  jira: { baseUrl: string; email: string; token: string };
  figma?: { token: string; teamIds: string[] };
}

export interface SubmitResult {
  date: string;
  projectKey: string | null;
  success: boolean;
  error?: string;
}
