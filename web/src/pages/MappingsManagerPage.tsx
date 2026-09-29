import { useEffect, useState } from "react";
import type { MappingStore } from "@shared/types";
import { api } from "../api";

type LocalEntry = { kimaiProjectId: number; kimaiActivityId: number; ignored: boolean };
type KimaiOptions = { projects: { id: number; name: string }[]; activities: { id: number; name: string }[] };

function toLocalEntry(entry: MappingStore[string]): LocalEntry {
  if ("ignored" in entry) return { kimaiProjectId: 0, kimaiActivityId: 0, ignored: true };
  return { kimaiProjectId: entry.kimaiProjectId, kimaiActivityId: entry.kimaiActivityId, ignored: false };
}

export function MappingsManagerPage({ onBack }: { onBack: () => void }) {
  const [mapping, setMapping] = useState<MappingStore | null>(null);
  const [options, setOptions] = useState<KimaiOptions | null>(null);
  const [edits, setEdits] = useState<Record<string, LocalEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMapping(), api.getKimaiOptions()]).then(([m, o]) => {
      setMapping(m);
      setOptions(o);
      setEdits(Object.fromEntries(Object.entries(m).map(([key, value]) => [key, toLocalEntry(value)])));
    });
  }, []);

  function updateEdit(projectKey: string, patch: Partial<LocalEntry>) {
    setSaved(false);
    setEdits((prev) => ({ ...prev, [projectKey]: { ...prev[projectKey], ...patch } }));
  }

  async function handleSaveAll() {
    setSaving(true);
    setError(null);
    try {
      for (const [projectKey, e] of Object.entries(edits)) {
        const entry = e.ignored
          ? ({ ignored: true } as const)
          : { kimaiProjectId: e.kimaiProjectId, kimaiActivityId: e.kimaiActivityId };
        await api.saveMappingEntry(projectKey, entry);
      }
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!mapping || !options) return <div>Ladowanie...</div>;

  const projectKeys = Object.keys(mapping).sort();

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Mapowania</h1>
        <button className="secondary" onClick={onBack}>
          Wstecz
        </button>
      </div>
      <p className="hint">
        Zmien projekt, aktywnosc lub oznaczenie "pominiety" dla dowolnego juz zapisanego repo/projektu.
      </p>
      {projectKeys.length === 0 && <p className="hint">Brak zapisanych mapowan.</p>}
      {projectKeys.length > 0 && (
        <div className="card">
          {projectKeys.map((projectKey) => {
            const e = edits[projectKey] ?? toLocalEntry(mapping[projectKey]);
            return (
              <div className="mapping-row" key={projectKey}>
                <span className="project-key">{projectKey}</span>
                <select
                  value={e.ignored ? "" : e.kimaiProjectId}
                  disabled={e.ignored}
                  onChange={(ev) => updateEdit(projectKey, { kimaiProjectId: Number(ev.target.value) })}
                >
                  <option value="" disabled>
                    Projekt Kimai
                  </option>
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={e.ignored ? "" : e.kimaiActivityId}
                  disabled={e.ignored}
                  onChange={(ev) => updateEdit(projectKey, { kimaiActivityId: Number(ev.target.value) })}
                >
                  <option value="" disabled>
                    Aktywnosc Kimai
                  </option>
                  {options.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button className="secondary" onClick={() => updateEdit(projectKey, { ignored: !e.ignored })}>
                  {e.ignored ? "Cofnij pominiecie" : "Pomin"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {projectKeys.length > 0 && (
        <button onClick={handleSaveAll} disabled={saving}>
          {saving ? "Zapisuje..." : "Zapisz zmiany"}
        </button>
      )}
      {saved && <p className="summary-ok">Zapisano.</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
