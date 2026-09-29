import type { ActivityEvent } from "../shared/types";

export interface GithubClientConfig {
  token: string;
}

interface GithubEvent {
  type: string;
  created_at: string;
  repo: { name: string };
}

const RELEVANT_EVENT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "PullRequestReviewEvent",
  "PullRequestReviewCommentEvent",
  "IssueCommentEvent",
]);

function headers(config: GithubClientConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
  };
}

async function fetchGithubUsername(config: GithubClientConfig): Promise<string> {
  const res = await fetch("https://api.github.com/user", { headers: headers(config) });
  if (!res.ok) throw new Error(`GitHub /user request failed: ${res.status}`);
  const body = (await res.json()) as { login: string };
  return body.login;
}

export async function testGithubConnection(config: GithubClientConfig): Promise<boolean> {
  try {
    await fetchGithubUsername(config);
    return true;
  } catch {
    return false;
  }
}

export async function fetchGithubTokenScopes(config: GithubClientConfig): Promise<string[]> {
  try {
    const res = await fetch("https://api.github.com/user", { headers: headers(config) });
    if (!res.ok) return [];
    // Classic PATs report their scopes here; fine-grained PATs and GitHub Apps
    // don't send this header at all, so an empty list just means "unknown".
    const raw = res.headers.get("x-oauth-scopes");
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchGithubActivity(
  config: GithubClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const username = await fetchGithubUsername(config);
  const events: ActivityEvent[] = [];

  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/users/${username}/events?per_page=100&page=${page}`,
      { headers: headers(config) }
    );
    if (!res.ok) {
      // The first page failing is a real connectivity/auth problem worth surfacing.
      // A later page failing usually means we've walked past GitHub's undocumented
      // event retention cap (~300 events) — stop with what we have instead of
      // failing the whole month's generate.
      if (page === 1) throw new Error(`GitHub events request failed: ${res.status}`);
      break;
    }
    const batch = (await res.json()) as GithubEvent[];
    if (batch.length === 0) break;

    let reachedTooOld = false;
    for (const evt of batch) {
      const ts = new Date(evt.created_at);
      if (ts < since) {
        reachedTooOld = true;
        break; // events are reverse-chronological
      }
      if (ts > until) continue;
      if (!RELEVANT_EVENT_TYPES.has(evt.type)) continue;
      events.push({ projectKey: `github:${evt.repo.name}`, timestamp: evt.created_at, source: "github" });
    }
    if (reachedTooOld) break;
  }

  return events;
}
