import type { ActivityEvent, MappingStore } from "../shared/types";

// Not preceded/followed by a letter or digit, so "checkout_PROJ-7_v2" matches but "proj-7" does not.
const JIRA_KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+(?![A-Za-z0-9])/g;

/** First `jira:KEY` (in text order) that has an entry in the mapping, ignored entries included. */
export function findJiraProjectKey(texts: string[], mapping: MappingStore): string | null {
  for (const text of texts) {
    for (const match of text.matchAll(JIRA_KEY_RE)) {
      const key = `jira:${match[1]}`;
      if (mapping[key]) return key;
    }
  }
  return null;
}

/** Re-keys Figma events whose texts contain a mapped Jira key so they land in the same Kimai project as the Jira work. */
export function remapFigmaEvents(events: ActivityEvent[], mapping: MappingStore): ActivityEvent[] {
  return events.map((evt) => {
    if (evt.source !== "figma" || !evt.meta) return evt;
    const jiraKey = findJiraProjectKey(evt.meta.texts, mapping);
    return jiraKey ? { ...evt, projectKey: jiraKey } : evt;
  });
}
