import type { ActivityEvent } from "../shared/types";

export interface FigmaClientConfig {
  token: string;
  teamIds: string[];
}

interface FigmaVersion {
  created_at: string;
  label: string | null;
  description: string | null;
  user: { id: string };
}
interface FigmaVersionsResponse {
  versions: FigmaVersion[];
  pagination?: { next_page?: string };
}
interface FigmaComment {
  message: string;
  created_at: string;
  user: { id: string };
}

const BASE_URL = "https://api.figma.com";
const MAX_VERSION_PAGES = 20;

async function figmaGet<T>(config: FigmaClientConfig, urlOrPath: string): Promise<T> {
  // Pagination hands us absolute URLs; never send the token anywhere but Figma's API.
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${BASE_URL}${urlOrPath}`;
  if (!url.startsWith(`${BASE_URL}/`)) throw new Error(`Refusing to call non-Figma URL: ${url}`);
  const res = await fetch(url, { headers: { "X-Figma-Token": config.token } });
  if (!res.ok) throw new Error(`Figma request ${urlOrPath} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function testFigmaConnection(config: FigmaClientConfig): Promise<boolean> {
  try {
    await figmaGet(config, "/v1/me");
    return true;
  } catch {
    return false;
  }
}

function inRange(iso: string, since: Date, until: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= until.getTime();
}

async function fetchFileEvents(
  config: FigmaClientConfig,
  userId: string,
  file: { key: string; name: string },
  folderName: string,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  const projectKey = `figma:file:${file.key}`;
  const make = (timestamp: string, extraTexts: (string | null)[]): ActivityEvent => ({
    projectKey,
    timestamp,
    source: "figma",
    label: file.name,
    meta: {
      fileName: file.name,
      folderName,
      texts: [file.name, ...extraTexts].filter((t): t is string => Boolean(t)),
    },
  });

  let next: string | undefined = `/v1/files/${file.key}/versions`;
  for (let page = 0; next && page < MAX_VERSION_PAGES; page++) {
    const data: FigmaVersionsResponse = await figmaGet<FigmaVersionsResponse>(config, next);
    for (const v of data.versions) {
      if (v.user.id !== userId || !inRange(v.created_at, since, until)) continue;
      events.push(make(v.created_at, [v.label, v.description]));
    }
    // Versions come newest-first: once a whole page predates the range, older pages cannot matter.
    if (data.versions.length > 0 && data.versions.every((v) => new Date(v.created_at) < since)) break;
    next = data.pagination?.next_page;
  }

  const { comments } = await figmaGet<{ comments: FigmaComment[] }>(config, `/v1/files/${file.key}/comments`);
  for (const c of comments) {
    if (c.user.id !== userId || !inRange(c.created_at, since, until)) continue;
    events.push(make(c.created_at, [c.message]));
  }

  return events;
}

export async function fetchFigmaActivity(
  config: FigmaClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const me = await figmaGet<{ id: string }>(config, "/v1/me");
  const events: ActivityEvent[] = [];

  for (const teamId of config.teamIds) {
    const { projects } = await figmaGet<{ projects: { id: string; name: string }[] }>(
      config,
      `/v1/teams/${encodeURIComponent(teamId)}/projects`
    );
    for (const project of projects) {
      const { files } = await figmaGet<{ files: { key: string; name: string; last_modified: string }[] }>(
        config,
        `/v1/projects/${encodeURIComponent(project.id)}/files`
      );
      for (const file of files) {
        // A file untouched since before the range cannot hold versions inside it.
        if (new Date(file.last_modified) < since) continue;
        events.push(...(await fetchFileEvents(config, me.id, file, project.name, since, until)));
      }
    }
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}
