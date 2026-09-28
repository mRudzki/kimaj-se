import { useState } from "react";
import type { MonthlySummary } from "@shared/types";
import { api } from "../api";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function HomePage({
  onOpenSettings,
  onGenerated,
}: {
  onOpenSettings: () => void;
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
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>kimaj-se</h1>
      <button onClick={onOpenSettings}>Ustawienia</button>
      <div>
        <label>
          Miesiac:
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generuje..." : "Generuj"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
