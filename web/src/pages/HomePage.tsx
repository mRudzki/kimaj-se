import { useState } from "react";
import type { MonthlySummary } from "@shared/types";
import { api, ApiError } from "../api";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function HomePage({
  onOpenSettings,
  onOpenMappings,
  onGenerated,
}: {
  onOpenSettings: () => void;
  onOpenMappings: () => void;
  onGenerated: (summary: MonthlySummary) => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      onGenerated(await api.generate(month));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        onOpenSettings();
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>kimaj-se</h1>
        <div className="toolbar">
          <button className="secondary" onClick={onOpenMappings}>
            Mapowania
          </button>
          <button className="secondary" onClick={onOpenSettings}>
            Ustawienia
          </button>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="month">Miesiac</label>
          <input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className="hint">Wybierz miesiac, dla ktorego chcesz uzupelnic czas w Kimai.</p>
        </div>
        <button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generuje..." : "Generuj"}
        </button>
        <p className="hint">
          Pobierze Twoja aktywnosc z GitHub, Jiry i Figmy (jesli skonfigurowana) za ten miesiac i zbuduje propozycje wpisow czasu do przejrzenia
          przed wyslaniem. Nic nie trafia do Kimai na tym etapie.
        </p>
      </div>

      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
