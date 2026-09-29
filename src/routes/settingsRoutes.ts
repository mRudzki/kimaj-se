import { Hono } from "hono";
import type { AppConfig } from "../shared/types";

export interface SettingsDeps {
  loadConfig: () => Promise<AppConfig | null>;
  saveConfig: (config: AppConfig) => Promise<void>;
  testKimaiConnection: (c: AppConfig["kimai"]) => Promise<boolean>;
  testGithubConnection: (c: AppConfig["github"]) => Promise<boolean>;
  fetchGithubTokenScopes: (c: AppConfig["github"]) => Promise<string[]>;
  testJiraConnection: (c: AppConfig["jira"]) => Promise<boolean>;
  testFigmaConnection: (c: NonNullable<AppConfig["figma"]>) => Promise<boolean>;
}

const REQUIRED_GITHUB_SCOPE = "repo";

export function createSettingsRoutes(deps: SettingsDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await deps.loadConfig()));

  routes.post("/", async (c) => {
    const config = await c.req.json<AppConfig>();
    await deps.saveConfig(config);
    return c.json({ ok: true });
  });

  routes.post("/test", async (c) => {
    const config = await c.req.json<AppConfig>();
    const figmaConfig = config.figma?.token ? config.figma : null;
    const [kimai, github, jira, figma] = await Promise.all([
      deps.testKimaiConnection(config.kimai),
      deps.testGithubConnection(config.github),
      deps.testJiraConnection(config.jira),
      figmaConfig ? deps.testFigmaConnection(figmaConfig) : Promise.resolve(null),
    ]);

    let githubWarning: string | null = null;
    if (github) {
      const scopes = await deps.fetchGithubTokenScopes(config.github);
      if (scopes.length > 0 && !scopes.includes(REQUIRED_GITHUB_SCOPE)) {
        githubWarning =
          `Token nie ma zakresu "${REQUIRED_GITHUB_SCOPE}" — commity i pull requesty z prywatnych ` +
          `repozytoriow nie beda widoczne. Wygeneruj nowy classic token z zaznaczonym "${REQUIRED_GITHUB_SCOPE}".`;
      }
    }

    return c.json({ kimai, github, githubWarning, jira, ...(figma === null ? {} : { figma }) });
  });

  return routes;
}
