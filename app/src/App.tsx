import { useMemo, useState } from "react";
import ModeSelector from "./components/ModeSelector";
import TnMap from "./components/TnMap";
import DataExploration from "./modes/DataExploration";
import ComingSoon from "./modes/ComingSoon";
import { useJson } from "./lib/useJson";
import type { DashboardMode, YearlyRow, YearRange } from "./lib/types";
import "./App.css";

function App() {
  const [mode, setMode] = useState<DashboardMode>("explore");

  // The year filter lives here rather than inside Mode 1 so that the map and
  // the charts always describe the same slice of the data.
  const { data: yearly } = useJson<YearlyRow[]>("yearly.json");
  const allYears = useMemo(() => (yearly ?? []).map((y) => y.year), [yearly]);
  const [range, setRange] = useState<YearRange | null>(null);

  const yearRange: YearRange = range ?? [
    allYears[0] ?? "2015",
    allYears[allYears.length - 1] ?? "2025",
  ];
  const [fromYear, toYear] = yearRange;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Tennessee CMV Crash Dashboard</h1>
          <p>Commercial motor vehicle crashes on TN interstates and state routes</p>
        </div>
        <ModeSelector mode={mode} onChange={setMode} />
      </header>

      <div className="app-filters">
        <label>
          From
          <select
            value={fromYear}
            onChange={(e) => setRange([e.target.value, toYear])}
            disabled={allYears.length === 0}
          >
            {allYears.map((y) => (
              <option key={y} value={y} disabled={y > toYear}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select
            value={toYear}
            onChange={(e) => setRange([fromYear, e.target.value])}
            disabled={allYears.length === 0}
          >
            {allYears.map((y) => (
              <option key={y} value={y} disabled={y < fromYear}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {range && (
          <button type="button" className="reset-btn" onClick={() => setRange(null)}>
            Reset range
          </button>
        )}
        <span className="app-filters__note">Applies to the map and the charts</span>
      </div>

      <main className="app-main">
        <section className="app-map-panel">
          <TnMap yearRange={yearRange} />
        </section>

        <section className="app-mode-panel">
          {mode === "explore" && <DataExploration yearRange={yearRange} />}
          {mode === "risk" && (
            <ComingSoon
              title="Mode 2 · Risk Assessment"
              blurb="Visualize different ways of assessing risk on the roadways given certain specifications. Coming later."
            />
          )}
          {mode === "predict" && (
            <ComingSoon
              title="Mode 3 · Predictive Modeling"
              blurb="Visualize results from a predictive model and the probability of crashes occurring on a given road. Coming later."
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        Data: TN CMV crash extract (2015 to 2025) · Highways: placeholder public roads data pending the TDOT Road
        Geometrics shapefile
      </footer>
    </div>
  );
}

export default App;
