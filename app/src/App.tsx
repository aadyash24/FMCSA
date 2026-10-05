import { useCallback, useMemo, useState } from "react";
import ModeSelector from "./components/ModeSelector";
import ThemeToggle from "./components/ThemeToggle";
import TnMap from "./components/TnMap";
import FilterPanel from "./components/FilterPanel";
import Overview from "./modes/Overview";
import DataExploration from "./modes/DataExploration";
import MannerOfCollision from "./modes/MannerOfCollision";
import CorridorAnalysis from "./modes/CorridorAnalysis";
import FaultAnalysis from "./modes/FaultAnalysis";
import type { FaultSummary } from "./modes/FaultAnalysis";
import { useJson } from "./lib/useJson";
import { useTheme } from "./lib/useTheme";
import { activeFilterCount, defaultFilters, filterCrashes } from "./lib/crashes";
import type { CrashData, Filters } from "./lib/crashes";
import type { CorridorData } from "./lib/corridors";
import type { RenderMap } from "./lib/modeProps";
import type { DashboardMode, YearRange } from "./lib/types";
import "./App.css";

const TABS: DashboardMode[] = ["overview", "explore", "manner", "corridor", "fault"];

/** ?tab=fault opens a tab directly, so a view can be linked (like the UConn dashboard's &page=). */
function tabFromUrl(): DashboardMode {
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.includes(t as DashboardMode) ? (t as DashboardMode) : "overview";
}

function App() {
  const [mode, setModeState] = useState<DashboardMode>(tabFromUrl);
  const setMode = useCallback((m: DashboardMode) => {
    setModeState(m);
    const url = new URL(window.location.href);
    if (m === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", m);
    window.history.replaceState(null, "", url);
  }, []);
  const { choice, resolved, setChoice } = useTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data, error: dataError } = useJson<CrashData>("crashes.json");
  const { data: corridors } = useJson<CorridorData>("corridors.json");
  const { data: faultSummary } = useJson<FaultSummary>("fault_summary.json");

  const years = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.cols.year)].sort((a, b) => a - b).map(String);
  }, [data]);
  const fullRange: YearRange = [years[0] ?? "2015", years[years.length - 1] ?? "2025"];

  // Filters live here rather than inside a mode so that the map and every chart
  // always describe the same slice of the data. null = untouched defaults.
  const [touched, setTouched] = useState<Filters | null>(null);
  const filters = touched ?? defaultFilters(fullRange);
  const setFilters = setTouched;
  const activeCount = activeFilterCount(filters, fullRange);

  const rows = useMemo(() => (data ? filterCrashes(data, filters) : []), [data, filters]);

  const toggleSeverity = useCallback(
    (label: string) =>
      setFilters({
        ...filters,
        severityOff: filters.severityOff.includes(label)
          ? filters.severityOff.filter((s) => s !== label)
          : [...filters.severityOff, label],
      }),
    [filters, setFilters]
  );
  const setCounty = useCallback((county: string | null) => setFilters({ ...filters, county }), [filters, setFilters]);

  const renderMap: RenderMap = (o = {}) => (
    <TnMap
      data={data}
      rows={o.rows ?? rows}
      theme={resolved}
      networkOnly={o.networkOnly}
      severityOff={filters.severityOff}
      onToggleSeverity={toggleSeverity}
      county={filters.county}
      onCountyChange={setCounty}
      highlight={o.highlight}
      onRouteClick={o.onRouteClick}
      colorBy={o.colorBy}
    />
  );

  const common = { data: data!, rows, filters, onChange: setFilters, theme: resolved, renderMap };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__title">
          <h1>
            TN CRASH <span>– Crashes involving commercial motor vehicles</span>
          </h1>
        </div>
        <ModeSelector mode={mode} onChange={setMode} />
        <div className="app-header__actions">
          {mode !== "overview" && (
            <button
              type="button"
              className={`filters-btn${activeCount ? " has-active" : ""}`}
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 3h13M4 8h8M6.5 13h3" />
              </svg>
              Filters
              {activeCount > 0 && <span className="filters-btn__n">{activeCount}</span>}
            </button>
          )}
          <ThemeToggle choice={choice} onChange={setChoice} />
        </div>
      </header>

      <FilterPanel
        open={filtersOpen && mode !== "overview"}
        onClose={() => setFiltersOpen(false)}
        data={data}
        years={years}
        filters={filters}
        onChange={setFilters}
        onReset={() => setTouched(null)}
        activeCount={activeCount}
      />

      {dataError && <div className="app-error">Couldn't load the crash data: {dataError}</div>}
      {!data && !dataError && mode !== "overview" && <div className="app-loading">Loading crash data…</div>}

      {mode === "overview" && (
        <main className="app-page">
          <Overview data={data} onOpen={setMode} />
        </main>
      )}
      {data && mode === "explore" && <DataExploration {...common} />}
      {data && mode === "manner" && <MannerOfCollision {...common} />}
      {data && mode === "corridor" && <CorridorAnalysis {...common} corridors={corridors} />}
      {data && mode === "fault" && <FaultAnalysis {...common} summary={faultSummary} />}

      {mode === "overview" && (
        <footer className="app-footer">
          Data: TN CMV crash extract (2015 to 2025) · County boundaries: US Census · Highways: placeholder public roads
          data pending the TDOT Road Geometrics shapefile · Layout after the UConn CT Crash FMCSA dashboard
        </footer>
      )}
    </div>
  );
}

export default App;
