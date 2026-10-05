import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CrashData, Filters, FmcsaType, ListField } from "../lib/crashes";
import { countBy, filterCrashes, fmt } from "../lib/crashes";
import { SEVERITY_ORDER } from "../lib/severity";
import "./FilterPanel.css";

/**
 * Slide-out filter panel, after the UConn dashboard's side panel: every filter
 * in one place, each a multi-select list with crash counts. The map and every
 * chart on every tab follow it.
 */

const UNIT_OPTIONS = ["Single vehicle", "Two vehicles", "Three or more"];

const FMCSA_OPTIONS: { id: FmcsaType; label: string; hint: string }[] = [
  { id: "fatal", label: "Fatal", hint: "At least one person killed" },
  {
    id: "towed",
    label: "Vehicle towed",
    hint: "A vehicle was towed from the scene (TowedInd). Mostly left blank from 2021 on, so recent years undercount.",
  },
  {
    id: "injTrans",
    label: "Injured transported",
    hint: "An injured person was taken for treatment, e.g. by ambulance (InjuredTransInd)",
  },
];

const LISTS: { field: ListField; label: string; search?: boolean }[] = [
  { field: "manner", label: "Manner of collision" },
  { field: "route", label: "Route class" },
  { field: "surface", label: "Road surface condition" },
  { field: "weather", label: "Weather" },
  { field: "light", label: "Light condition" },
  { field: "workZone", label: "Work zone related" },
  { field: "intersection", label: "Intersection related" },
  { field: "schoolBus", label: "School bus related" },
  { field: "agency", label: "Law enforcement agency", search: true },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  data: CrashData | null;
  years: string[];
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  activeCount: number;
}

export default function FilterPanel({ open, onClose, data, years, filters, onChange, onReset, activeCount }: FilterPanelProps) {
  const [fromYear, toYear] = filters.yearRange;
  const counties = data ? [...data.keys.county].filter((c) => !c.startsWith("County ") && c !== "Unknown").sort() : [];

  const severityCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const rows = filterCrashes(data, filters, ["severityOff"]);
    return new Map(countBy(data, rows, "severity").map((r) => [r.label, r.count]));
  }, [data, filters]);

  return (
    <>
      {open && <div className="filter-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`filter-panel${open ? " is-open" : ""}`} aria-label="Filters" aria-hidden={!open}>
        <header className="filter-panel__head">
          <h2>Filters</h2>
          <span className="filter-panel__count">{activeCount ? `${activeCount} active` : "None active"}</span>
          {activeCount > 0 && (
            <button type="button" className="filter-panel__reset" onClick={onReset}>
              Reset all
            </button>
          )}
          <button type="button" className="filter-panel__close" onClick={onClose} aria-label="Close filters">
            &times;
          </button>
        </header>

        <div className="filter-panel__body">
          <FilterSection label="Date range" open>
            <div className="filter-years">
              <select
                value={fromYear}
                onChange={(e) => onChange({ ...filters, yearRange: [e.target.value, toYear] })}
                aria-label="From year"
              >
                {years.map((y) => (
                  <option key={y} value={y} disabled={y > toYear}>
                    {y}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                value={toYear}
                onChange={(e) => onChange({ ...filters, yearRange: [fromYear, e.target.value] })}
                aria-label="To year"
              >
                {years.map((y) => (
                  <option key={y} value={y} disabled={y < fromYear}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </FilterSection>

          <FilterSection label="County" open active={!!filters.county}>
            <select
              className="filter-select"
              value={filters.county ?? ""}
              onChange={(e) => onChange({ ...filters, county: e.target.value || null })}
              aria-label="County"
            >
              <option value="">All counties</option>
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="filter-hint">Or click a county on the map.</p>
          </FilterSection>

          <FilterSection label="FMCSA reportable criteria" open active={filters.fmcsa.length > 0}>
            <p className="filter-hint">Crash must meet at least one checked criterion.</p>
            <div className="filter-chips">
              {FMCSA_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip${filters.fmcsa.includes(o.id) ? " chip--on" : ""}`}
                  aria-pressed={filters.fmcsa.includes(o.id)}
                  title={o.hint}
                  onClick={() => onChange({ ...filters, fmcsa: toggle(filters.fmcsa, o.id) })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection label="Most severe injury" open active={filters.severityOff.length > 0}>
            <ul className="filter-list">
              {[...SEVERITY_ORDER].reverse().filter((s) => data?.keys.severity.includes(s)).map((s) => {
                const on = !filters.severityOff.includes(s);
                return (
                  <li key={s}>
                    <label>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onChange({ ...filters, severityOff: toggle(filters.severityOff, s) })}
                      />
                      <span className="filter-list__name">{s}</span>
                      <span className="filter-list__n tnum">{fmt(severityCounts.get(s) ?? 0)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </FilterSection>

          <FilterSection label="Vehicles involved" active={filters.units.length > 0}>
            <div className="filter-chips">
              {UNIT_OPTIONS.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`chip${filters.units.includes(u) ? " chip--on" : ""}`}
                  aria-pressed={filters.units.includes(u)}
                  onClick={() => onChange({ ...filters, units: toggle(filters.units, u) })}
                >
                  {u}
                </button>
              ))}
            </div>
          </FilterSection>

          {data &&
            LISTS.map((l) => (
              <ListFilter key={l.field} {...l} data={data} filters={filters} onChange={onChange} />
            ))}
        </div>
      </aside>
    </>
  );
}

function FilterSection({
  label,
  open,
  active,
  children,
}: {
  label: string;
  open?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="filter-section" open={open}>
      <summary>
        {label}
        {active && <span className="filter-section__dot" aria-label="active" />}
      </summary>
      <div className="filter-section__body">{children}</div>
    </details>
  );
}

function ListFilter({
  field,
  label,
  search,
  data,
  filters,
  onChange,
}: {
  field: ListField;
  label: string;
  search?: boolean;
  data: CrashData;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [q, setQ] = useState("");
  const selected = filters.lists[field] ?? [];
  // Counts ignore this list's own selection so unticked options still show their size.
  const options = useMemo(() => countBy(data, filterCrashes(data, filters, [field]), field), [data, filters, field]);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const set = (values: string[]) => onChange({ ...filters, lists: { ...filters.lists, [field]: values } });

  return (
    <FilterSection label={label} active={selected.length > 0}>
      <div className="filter-list__actions">
        <span>{selected.length ? `${selected.length} selected` : "All"}</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => set([])}>
            Clear
          </button>
        )}
      </div>
      {search && (
        <input
          type="search"
          className="filter-search"
          placeholder={`Search ${options.length} agencies`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <ul className={`filter-list${search ? " filter-list--scroll" : ""}`}>
        {shown.slice(0, search && !q ? 40 : undefined).map((o) => (
          <li key={o.label}>
            <label>
              <input type="checkbox" checked={selected.includes(o.label)} onChange={() => set(toggle(selected, o.label))} />
              <span className="filter-list__name">{o.label}</span>
              <span className="filter-list__n tnum">{fmt(o.count)}</span>
            </label>
          </li>
        ))}
      </ul>
      {search && !q && options.length > 40 && <p className="filter-hint">Top 40 by crashes. Search to find others.</p>}
    </FilterSection>
  );
}
