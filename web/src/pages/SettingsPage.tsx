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
  const [status, setStatus] = useState<{ kimai: boolean; github: boolean; jira: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then((c) => c && setConfig(c));
  }, []);

  async function handleTest() {
    setStatus(await api.testConnections(config));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveConfig(config);
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
            GitHub -&gt; Settings -&gt; Developer settings -&gt; Personal access tokens. Wystarczy uprawnienie do odczytu
            aktywnosci (repo + read:user).
          </p>
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
