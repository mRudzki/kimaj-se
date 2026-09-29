import { useEffect, useState } from "react";
import type { MonthlySummary, SubmitResult, SummaryRow } from "@shared/types";
import { api } from "../api";
import { countWorkingDays } from "../summaryHours";

type KimaiOptions = { projects: { id: number; name: string }[]; activities: { id: number; name: string }[] };

export function SummaryPage({ summary, onBack }: { summary: MonthlySummary; onBack: () => void }) {
  const [rows, setRows] = useState<SummaryRow[]>(summary.rows);
  // Aligned 1:1 with `rows` by index; null means "not yet submitted".
  const [resultByIndex, setResultByIndex] = useState<(SubmitResult | null)[]>(rows.map(() => null));
  const [options, setOptions] = useState<KimaiOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.getKimaiOptions().then(setOptions);
  }, []);

  function updateRow(index: number, patch: Partial<SummaryRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function toggleSkipped(index: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Only (re)send rows that have hours, were not skipped, and were not
      // already accepted by Kimai — resending an already-successful row
      // would create a duplicate entry.
      const pendingIndices = rows
        .map((row, i) => i)
        .filter((i) => rows[i].hours > 0 && !skipped.has(i) && resultByIndex[i]?.success !== true);
      const pendingRows = pendingIndices.map((i) => rows[i]);

      // The server pushes exactly one result per row it doesn't silently skip;
      // since every row here has hours > 0, none are skipped, so results line
      // up 1:1 with pendingIndices in order.
      const { results: newResults } = await api.submit(pendingRows);

      setResultByIndex((prev) => {
        const next = [...prev];
        pendingIndices.forEach((rowIndex, j) => {
          next[rowIndex] = newResults[j];
        });
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!options) return <div>Ladowanie...</div>;

  const includedRows = rows.filter((_, i) => !skipped.has(i));
  const workingDays = countWorkingDays(includedRows);
  const expectedHours = workingDays * 8;
  const actualHours = includedRows.reduce((sum, row) => sum + row.hours, 0);
  const hoursMismatch = actualHours !== expectedHours;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Podsumowanie {summary.month}</h1>
        <button className="secondary" onClick={onBack}>
          Wstecz
        </button>
      </div>
      <p className="hint">
        Popraw projekt, aktywnosc, godziny lub opis dla dowolnego wiersza przed wyslaniem. Dni bez wykrytej
        aktywnosci maja 0h — uzupelnij je recznie, jesli pracowales.
      </p>
      <table>
        <thead>
          <tr>
            <th>Dzien</th>
            <th>Projekt</th>
            <th>Aktywnosc</th>
            <th>Godziny</th>
            <th>Opis</th>
            <th>Status</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const result = resultByIndex[i];
            const locked = result?.success === true;
            const isSkipped = skipped.has(i);
            const disabled = locked || isSkipped;
            return (
              <tr key={`${row.date}-${row.projectKey ?? "manual"}-${i}`}>
                <td>{row.date}</td>
                <td>
                  <select
                    value={row.kimaiProjectId ?? ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, { kimaiProjectId: Number(e.target.value) })}
                  >
                    <option value="" disabled>
                      {row.projectKey ?? "Wybierz projekt"}
                    </option>
                    {options.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={row.kimaiActivityId ?? ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, { kimaiActivityId: Number(e.target.value) })}
                  >
                    <option value="" disabled>
                      Wybierz aktywnosc
                    </option>
                    {options.activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step={0.5}
                    value={row.hours}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={row.description}
                    disabled={disabled}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                  />
                </td>
                <td>
                  {isSkipped ? (
                    <span className="hint">Pominieto</span>
                  ) : result ? (
                    <span className={result.success ? "status-ok" : "status-fail"}>
                      {result.success ? "Wyslano" : `Blad: ${result.error}`}
                    </span>
                  ) : (
                    row.status
                  )}
                </td>
                <td>
                  <button className="secondary" disabled={locked} onClick={() => toggleSkipped(i)}>
                    {isSkipped ? "Przywroc" : "Pomin"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={hoursMismatch ? "alert" : "summary-ok"}>
        Suma godzin w zestawieniu: {actualHours}h / oczekiwane {expectedHours}h dla {workingDays} dni roboczych.
        {hoursMismatch &&
          " Rozni sie od oczekiwanej liczby godzin — sprawdz, czy nie brakuje wpisow lub czy gdzies nie ma pomylki w godzinach."}
      </p>
      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Wysylam..." : "Wyslij do Kimai"}
      </button>
      <p className="hint">
        Wysyla tylko wiersze z godzinami &gt; 0, ktore nie sa pominiete i jeszcze nie zostaly pomyslnie zapisane w
        Kimai — mozesz bezpiecznie kliknac ponownie po poprawieniu bledow. Przyciskiem "Pomin" przy wierszu
        wylaczysz go z wysylki i z rozliczenia godzin bez usuwania go z listy.
      </p>
    </div>
  );
}
