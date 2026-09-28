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
      <h1>Ustawienia</h1>

      <fieldset>
        <legend>Kimai</legend>
        <input placeholder="Kimai URL" value={config.kimai.baseUrl} onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, baseUrl: e.target.value } })} />
        <input placeholder="Kimai token" value={config.kimai.token} onChange={(e) => setConfig({ ...config, kimai: { ...config.kimai, token: e.target.value } })} />
        {status && <span>{status.kimai ? "OK" : "Blad"}</span>}
      </fieldset>

      <fieldset>
        <legend>GitHub</legend>
        <input placeholder="GitHub token" value={config.github.token} onChange={(e) => setConfig({ ...config, github: { token: e.target.value } })} />
        {status && <span>{status.github ? "OK" : "Blad"}</span>}
      </fieldset>

      <fieldset>
        <legend>Jira</legend>
        <input placeholder="Jira URL" value={config.jira.baseUrl} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, baseUrl: e.target.value } })} />
        <input placeholder="Jira email" value={config.jira.email} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, email: e.target.value } })} />
        <input placeholder="Jira token" value={config.jira.token} onChange={(e) => setConfig({ ...config, jira: { ...config.jira, token: e.target.value } })} />
        {status && <span>{status.jira ? "OK" : "Blad"}</span>}
      </fieldset>

      <button onClick={handleTest}>Testuj polaczenia</button>
      <button onClick={handleSave} disabled={saving}>Zapisz</button>
    </div>
  );
}
