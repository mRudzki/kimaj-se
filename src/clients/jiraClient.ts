import type { ActivityEvent } from "../shared/types";

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  token: string;
}

interface JiraChangelogItem {
  field: string;
}
interface JiraChangelogHistory {
  author: { accountId: string };
  created: string;
  items: JiraChangelogItem[];
}
interface JiraComment {
  author: { accountId: string };
  created: string;
}
interface JiraIssue {
  fields: {
    project: { key: string };
    created: string;
    reporter?: { accountId: string };
    comment?: { comments: JiraComment[] };
  };
  changelog?: { histories: JiraChangelogHistory[] };
}
interface JiraSearchResponse {
  total: number;
  issues: JiraIssue[];
}

function headers(config: JiraClientConfig): HeadersInit {
  const basic = Buffer.from(`${config.email}:${config.token}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
  };
}

async function fetchJiraAccountId(config: JiraClientConfig): Promise<string> {
  const res = await fetch(`${config.baseUrl}/rest/api/3/myself`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Jira /myself request failed: ${res.status}`);
  const body = (await res.json()) as { accountId: string };
  return body.accountId;
}

export async function testJiraConnection(config: JiraClientConfig): Promise<boolean> {
  try {
    await fetchJiraAccountId(config);
    return true;
  } catch {
    return false;
  }
}

function inRange(iso: string, since: Date, until: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= until.getTime();
}

function jiraDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchJiraActivity(
  config: JiraClientConfig,
  since: Date,
  until: Date
): Promise<ActivityEvent[]> {
  const accountId = await fetchJiraAccountId(config);
  const jql = `(reporter = currentUser() OR assignee = currentUser()) AND updated >= "${jiraDate(since)}" AND updated <= "${jiraDate(until)}"`;
  const events: ActivityEvent[] = [];

  let startAt = 0;
  const maxResults = 50;
  while (true) {
    const url =
      `${config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}` +
      `&expand=changelog&fields=project,created,reporter,comment&startAt=${startAt}&maxResults=${maxResults}`;
    const res = await fetch(url, { headers: headers(config) });
    if (!res.ok) throw new Error(`Jira search request failed: ${res.status}`);
    const data = (await res.json()) as JiraSearchResponse;

    for (const issue of data.issues) {
      const projectKey = `jira:${issue.fields.project.key}`;

      if (
        issue.fields.reporter?.accountId === accountId &&
        inRange(issue.fields.created, since, until)
      ) {
        events.push({ projectKey, timestamp: issue.fields.created, source: "jira" });
      }

      for (const comment of issue.fields.comment?.comments ?? []) {
        if (comment.author.accountId !== accountId) continue;
        if (!inRange(comment.created, since, until)) continue;
        events.push({ projectKey, timestamp: comment.created, source: "jira" });
      }

      for (const history of issue.changelog?.histories ?? []) {
        if (history.author.accountId !== accountId) continue;
        if (!inRange(history.created, since, until)) continue;
        if (!history.items.some((i) => i.field === "status")) continue;
        events.push({ projectKey, timestamp: history.created, source: "jira" });
      }
    }

    startAt += data.issues.length;
    if (data.issues.length === 0 || startAt >= data.total) break;
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}
