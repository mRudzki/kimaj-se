import { useEffect, useState } from "react";
import { api } from "../api";

export function MappingPage({
  missingMappings,
  onResolved,
}: {
  missingMappings: string[];
  onResolved: () => Promise<void>;
}) {
  const [options, setOptions] = useState<{ projects: { id: number; name: string }[]; activities: { id: number; name: string }[] } | null>(null);
  const [choices, setChoices] = useState<Record<string, { kimaiProjectId: number; kimaiActivityId: number }>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getKimaiOptions().then(setOptions);
  }, []);

  function setChoice(projectKey: string, field: "kimaiProjectId" | "kimaiActivityId", value: number) {
    setChoices((prev) => ({
      ...prev,
      [projectKey]: { kimaiProjectId: 0, kimaiActivityId: 0, ...prev[projectKey], [field]: value },
    }));
  }

  function toggleSkipped(projectKey: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(projectKey)) next.delete(projectKey);
      else next.add(projectKey);
      return next;
    });
  }

  async function handleSaveAll() {
    setSaving(true);
    setError(null);
    try {
      for (const projectKey of missingMappings) {
        if (skipped.has(projectKey)) {
          await api.saveMappingEntry(projectKey, { ignored: true });
          continue;
        }
        const choice = choices[projectKey];
        if (!choice?.kimaiProjectId || !choice?.kimaiActivityId) continue;
        await api.saveMappingEntry(projectKey, choice);
      }
      await onResolved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!options) return <div>Ladowanie...</div>;

  const allChosen = missingMappings.every(
    (key) => skipped.has(key) || (choices[key]?.kimaiProjectId && choices[key]?.kimaiActivityId)
  );

  return (
    <div>
      <h1>Przypisz projekty</h1>
      <p className="hint">
        Te repozytoria/projekty nie maja jeszcze przypisanego projektu i aktywnosci w Kimai. Przypisz kazde z nich,
        zeby kontynuowac, albo pomin te, ktore sa prywatne i nie powinny trafiac do Kimai — nie beda juz pytane
        ponownie.
      </p>
      <div className="card">
        {missingMappings.map((projectKey) => {
          const isSkipped = skipped.has(projectKey);
          return (
            <div className="mapping-row" key={projectKey}>
              <span className="project-key">{projectKey}</span>
              <select
                disabled={isSkipped}
                onChange={(e) => setChoice(projectKey, "kimaiProjectId", Number(e.target.value))}
                defaultValue=""
              >
                <option value="" disabled>Projekt Kimai</option>
                {options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                disabled={isSkipped}
                onChange={(e) => setChoice(projectKey, "kimaiActivityId", Number(e.target.value))}
                defaultValue=""
              >
                <option value="" disabled>Aktywnosc Kimai</option>
                {options.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="secondary" onClick={() => toggleSkipped(projectKey)}>
                {isSkipped ? "Cofnij pominiecie" : "Pomin (prywatny projekt)"}
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={handleSaveAll} disabled={!allChosen || saving}>
        {saving ? "Zapisuje..." : "Zapisz mapowanie i kontynuuj"}
      </button>
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
