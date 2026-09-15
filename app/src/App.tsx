import { useState } from "react";
import ModeSelector from "./components/ModeSelector";
import TnMap from "./components/TnMap";
import DataExploration from "./modes/DataExploration";
import ComingSoon from "./modes/ComingSoon";
import type { DashboardMode } from "./lib/types";
import "./App.css";

function App() {
  const [mode, setMode] = useState<DashboardMode>("explore");

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Tennessee CMV Crash Dashboard</h1>
          <p>Commercial motor vehicle crashes on TN interstates and state routes</p>
        </div>
        <ModeSelector mode={mode} onChange={setMode} />
      </header>

      <main className="app-main">
        <section className="app-map-panel">
          <TnMap />
        </section>

        <section className="app-mode-panel">
          {mode === "explore" && <DataExploration />}
          {mode === "risk" && (
            <ComingSoon
              title="Mode 2 · Risk Assessment"
              blurb="Visualize different ways of assessing risk on the roadways given certain specifications — coming later."
            />
          )}
          {mode === "predict" && (
            <ComingSoon
              title="Mode 3 · Predictive Modeling"
              blurb="Visualize results from a predictive model and the probability of crashes occurring on a given road — coming later."
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        Data: TN CMV crash extract (2015–2025) · Highways: placeholder public roads data pending the TDOT Road
        Geometrics shapefile
      </footer>
    </div>
  );
}

export default App;
