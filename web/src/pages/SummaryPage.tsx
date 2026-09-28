import { useState } from "react";
import type { MonthlySummary, SubmitResult, SummaryRow } from "@shared/types";
import { api } from "../api";

export function SummaryPage({ summary, onBack }: { summary: MonthlySummary; onBack: () => void }) {
  const [rows, setRows] = useState<SummaryRow[]>(summary.rows);
  const [results, setResults] = useState<SubmitResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(index: number, patch: Partial<SummaryRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { results } = await api.submit(rows);
      setResults(results);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Podsumowanie {summary.month}</h1>
      <button onClick={onBack}>Wstecz</button>
      <table>
        <thead>
          <tr>
            <th>Dzien</th>
            <th>Projekt</th>
            <th>Godziny</th>
            <th>Opis</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const result = results?.find((r) => r.date === row.date && r.projectKey === row.projectKey);
            return (
              <tr key={`${row.date}-${row.projectKey ?? "manual"}-${i}`}>
                <td>{row.date}</td>
                <td>{row.projectKey ?? "-"}</td>
                <td>
                  <input
                    type="number"
                    step={0.5}
                    value={row.hours}
                    onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                  />
                </td>
                <td>{result ? (result.success ? "Wyslano" : `Blad: ${result.error}`) : row.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Wysylam..." : "Wyslij do Kimai"}
      </button>
    </div>
  );
}
