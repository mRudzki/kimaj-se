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
    if (!res.ok) throw new Error(`GitHub events request failed: ${res.status}`);
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
