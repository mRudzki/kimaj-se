import { useState } from "react";
import type { MappingHint, MonthlySummary } from "@shared/types";
import { SettingsPage } from "./pages/SettingsPage";
import { HomePage } from "./pages/HomePage";
import { MappingPage } from "./pages/MappingPage";
import { MappingsManagerPage } from "./pages/MappingsManagerPage";
import { SummaryPage } from "./pages/SummaryPage";
import { api } from "./api";

type View =
  | { name: "settings" }
  | { name: "home" }
  | { name: "mapping"; month: string; missingMappings: string[]; hints: Record<string, MappingHint> }
  | { name: "mappingsManager" }
  | { name: "summary"; summary: MonthlySummary };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });

  if (view.name === "settings") {
    return <SettingsPage onSaved={() => setView({ name: "home" })} />;
  }
  if (view.name === "home") {
    return (
      <HomePage
        onOpenSettings={() => setView({ name: "settings" })}
        onOpenMappings={() => setView({ name: "mappingsManager" })}
        onGenerated={(summary) =>
          setView(
            summary.missingMappings.length > 0
              ? {
                  name: "mapping",
                  month: summary.month,
                  missingMappings: summary.missingMappings,
                  hints: summary.missingHints ?? {},
                }
              : { name: "summary", summary }
          )
        }
      />
    );
  }
  if (view.name === "mappingsManager") {
    return <MappingsManagerPage onBack={() => setView({ name: "home" })} />;
  }
  if (view.name === "mapping") {
    return (
      <MappingPage
        missingMappings={view.missingMappings}
        hints={view.hints}
        onResolved={async () => {
          const summary = await api.generate(view.month);
          setView({ name: "summary", summary });
        }}
      />
    );
  }
  return <SummaryPage summary={view.summary} onBack={() => setView({ name: "home" })} />;
}
