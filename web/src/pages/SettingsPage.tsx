import { useEffect, useState } from "react";
import type { AppConfig } from "@shared/types";
import { api } from "../api";

const EMPTY_CONFIG: AppConfig = {
  kimai: { baseUrl: "", token: "" },
  github: { token: "" },
  jira: { baseUrl: "", email: "", token: "" },
};

export function SettingsPage({ onSaved }: { onSaved: () => void }) {
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<{
    kimai: boolean;
    github: boolean;
    githubWarning: string | null;
    jira: boolean;
    figma?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [figmaToken, setFigmaToken] = useState("");
  const [figmaTeams, setFigmaTeams] = useState(""); // comma-separated team ids, parsed on save/test

  useEffect(() => {
    api.getConfig().then((c) => {
      if (!c) return;
      setConfig(c);
      setFigmaToken(c.figma?.token ?? "");
      setFigmaTeams((c.figma?.teamIds ?? []).join(", "));
    });
  }, []);

  function currentConfig(): AppConfig {
    const { figma: _previous, ...rest } = config;
    const teamIds = figmaTeams.split(",").map((s) => s.trim()).filter(Boolean);
    return figmaToken.trim() ? { ...rest, figma: { token: figmaToken.trim(), teamIds } } : rest;
  }

  async function handleTest() {
    setStatus(await api.testConnections(currentConfig()));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveConfig(currentConfig());
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>kimaj-se / ustawienia</h1>

      <fieldset>
        <legend>Kimai</legend>
        <div className="field">
          <label>URL instancji</label>
          <input
            placeholder="https://time.mindpal.co"
            value={config.kimai.baseUrl}
            onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, baseUrl: e.target.value } })}
          />
          <p className="hint">Adres Twojej instancji Kimai, bez slasha na końcu.</p>
        </div>
        <div className="field">
          <label>
            Token API {status && <span className={status.kimai ? "status-ok" : "status-fail"}>{status.kimai ? "OK" : "Blad"}</span>}
          </label>
          <input
            placeholder="Kimai token"
            value={config.kimai.token}
            onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, token: e.target.value } })}
          />
          <p className="hint">Wygeneruj w Kimai: profil uzytkownika -&gt; API access -&gt; Create API token.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>GitHub</legend>
        <div className="field">
          <label>
            Personal access token{" "}
            {status && <span className={status.github ? "status-ok" : "status-fail"}>{status.github ? "OK" : "Blad"}</span>}
          </label>
          <input
            placeholder="ghp_..."
            value={config.github.token}
            onChange={(e) => setConfig({ ...config, github: { token: e.target.value } })}
          />
          <p className="hint">
            GitHub -&gt; Settings -&gt; Developer settings -&gt; Personal access tokens (classic) -&gt; Generate new token.
            Zaznacz pelny zakres <strong>repo</strong> — bez niego commity i pull requesty z prywatnych repozytoriow
            nie beda widoczne w aktywnosci.
          </p>
          {status?.githubWarning && <p className="alert">{status.githubWarning}</p>}
        </div>
      </fieldset>

      <fieldset>
        <legend>Jira</legend>
        <div className="field">
          <label>URL instancji</label>
          <input
            placeholder="https://twojafirma.atlassian.net"
            value={config.jira.baseUrl}
            onChange={(e) => setConfig({ ...config, jira: { ...config.jira, baseUrl: e.target.value } })}
          />
          <p className="hint">Adres Twojej instancji Jira Cloud.</p>
        </div>
        <div className="field">
          <label>Email</label>
          <input
            placeholder="ty@firma.com"
            value={config.jira.email}
            onChange={(e) => setConfig({ ...config, jira: { ...config.jira, email: e.target.value } })}
          />
          <p className="hint">Adres, ktorym logujesz sie do Jiry/Atlassian.</p>
        </div>
        <div className="field">
          <label>
            Token API {status && <span className={status.jira ? "status-ok" : "status-fail"}>{status.jira ? "OK" : "Blad"}</span>}
          </label>
          <input
            placeholder="Jira token"
            value={config.jira.token}
            onChange={(e) => setConfig({ ...config, jira: { ...config.jira, token: e.target.value } })}
          />
          <p className="hint">
            Atlassian -&gt; Account settings -&gt; Security -&gt; API tokens -&gt; Create API token.
          </p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Figma (opcjonalnie)</legend>
        <div className="field">
          <label>
            Personal access token{" "}
            {status?.figma !== undefined && (
              <span className={status.figma ? "status-ok" : "status-fail"}>{status.figma ? "OK" : "Blad"}</span>
            )}
          </label>
          <input placeholder="figd_..." value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} />
          <p className="hint">
            Figma -&gt; Settings -&gt; Security -&gt; Personal access tokens. Wymagane zakresy: file_content:read,
            file_versions:read, file_comments:read, projects:read. Zostaw puste, zeby pominac Figme.
          </p>
        </div>
        <div className="field">
          <label>Team ID</label>
          <input placeholder="123456789012345678" value={figmaTeams} onChange={(e) => setFigmaTeams(e.target.value)} />
          <p className="hint">
            Numer z adresu teamu: figma.com/files/team/<strong>ID</strong>/... Kilka teamow oddziel przecinkami.
            Figma nie udostepnia listy teamow przez API, wiec trzeba je wpisac recznie.
          </p>
        </div>
      </fieldset>

      <div className="toolbar">
        <button className="secondary" onClick={handleTest}>
          Testuj polaczenia
        </button>
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Zapisuje..." : "Zapisz"}
        </button>
      </div>
      <p className="hint">Tokeny zapisujemy lokalnie w ~/.kimaj-se/config.json, nigdy w repozytorium.</p>
    </div>
  );
}
