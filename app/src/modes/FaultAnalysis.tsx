import { useCallback, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fmt, yearLabel } from "../lib/crashes";
import type { ModeProps } from "../lib/modeProps";
import { chartTheme } from "../lib/chartTheme";
import type { ResolvedTheme } from "../lib/theme";
import DashboardGrid from "../components/DashboardGrid";
import { Callout, Indicator, Panel } from "../components/Widgets";
import "./DataExploration.css";
import "./FaultAnalysis.css";

/**
 * At-fault view for two-vehicle truck vs. non-truck crashes, from the rule
 * engine in data/fault/ (rules.json + score_fault.py). Two views:
 *   full      all inputs, including the driver records (2023-2025 only, 151 crashes)
 *   geometry  maneuver + point of impact for both vehicles, no driver records
 * Outcomes reach crashes.json through prep_crash_data.py, so they follow the
 * shared filters like every other tab.
 */

export interface FaultSummary {
  rules_version: string;
  in_scope: number;
  funnel_by_year: Record<string, Record<string, number>>;
  top_reasons_truck: Record<string, number>;
  top_reasons_other: Record<string, number>;
  geometry_view: {
    in_scope: number;
    top_patterns_truck: Record<string, number>;
    top_patterns_other: Record<string, number>;
    agreement_with_full_view: Record<string, number>;
  };
}

type View = "faultFull" | "faultGeo";
const OUTCOMES = ["Truck driver", "Non-truck driver", "Equal fault", "Undetermined"] as const;
const OUT = "Out of scope";
const BUCKETS = ["Fatal", "Injury", "Property damage"] as const;

function outcomeColors(theme: ResolvedTheme): Record<string, string> {
  return theme === "dark"
    ? { "Truck driver": "#f5a55f", "Non-truck driver": "#6b95ff", "Equal fault": "#b48bf0", Undetermined: "#6f7784" }
    : { "Truck driver": "#d97706", "Non-truck driver": "#1d4ed8", "Equal fault": "#7c5cd6", Undetermined: "#98a2b3" };
}

function bucket(label: string): (typeof BUCKETS)[number] | null {
  if (label === "Fatal") return "Fatal";
  if (label.startsWith("Injury")) return "Injury";
  if (label.startsWith("Property Damage")) return "Property damage";
  return null;
}

function pct(n: number, d: number) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "–";
}

interface FaultProps extends ModeProps {
  summary: FaultSummary | null;
}

export default function FaultAnalysis({ data, rows, filters, theme, renderMap, summary }: FaultProps) {
  const { axis, grid, tip } = chartTheme(theme);
  const COLORS = outcomeColors(theme);
  const [view, setView] = useState<View>("faultGeo");
  const [off, setOff] = useState<string[]>([]);

  const keys = data.keys[view];
  const col = data.cols[view];
  const outIdx = keys.indexOf(OUT);

  const scored = useMemo(() => rows.filter((i) => col[i] !== outIdx), [rows, col, outIdx]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of scored) c[keys[col[i]]] = (c[keys[col[i]]] ?? 0) + 1;
    return c;
  }, [scored, keys, col]);
  const attributed = (counts["Truck driver"] ?? 0) + (counts["Non-truck driver"] ?? 0);

  const mapRows = useMemo(() => {
    if (!off.length) return scored;
    const hidden = new Set(off.map((o) => keys.indexOf(o)));
    return scored.filter((i) => !hidden.has(col[i]));
  }, [scored, off, keys, col]);

  const bySeverity = useMemo(() => {
    const t = BUCKETS.map((b) => ({ bucket: b, total: 0, ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])) })) as ({
      bucket: string;
      total: number;
    } & Record<string, number | string>)[];
    for (const i of scored) {
      const b = bucket(data.keys.severity[data.cols.severity[i]]);
      if (!b) continue;
      const r = t[BUCKETS.indexOf(b)];
      r[keys[col[i]]] = (r[keys[col[i]]] as number) + 1;
      r.total++;
    }
    // Shares within each bucket, so fatal (few crashes) reads as clearly as PDO (many).
    return t.map((r) => ({
      ...r,
      label: `${r.bucket} (${fmt(r.total)})`,
      ...Object.fromEntries(OUTCOMES.map((o) => [o, r.total ? +((100 * (r[o] as number)) / r.total).toFixed(1) : 0])),
    }));
  }, [scored, data, keys, col]);

  const byYear = useMemo(() => {
    const m = new Map<number, Record<string, number>>();
    for (const i of scored) {
      const y = data.cols.year[i];
      const r = m.get(y) ?? { year: y };
      r[keys[col[i]]] = (r[keys[col[i]]] ?? 0) + 1;
      m.set(y, r);
    }
    return [...m.values()].sort((a, b) => a.year - b.year);
  }, [scored, data, keys, col]);

  const toggle = useCallback((o: string) => setOff((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])), []);
  const rank = useMemo(() => {
    const order: Record<string, number> = { Undetermined: 0, "Equal fault": 1, "Non-truck driver": 2, "Truck driver": 2 };
    return (i: number) => order[keys[col[i]]] ?? 0;
  }, [keys, col]);
  const colorFor = useCallback((i: number) => COLORS[keys[col[i]]] ?? "#888", [COLORS, keys, col]);
  const popupExtra = useCallback((i: number) => `<strong>At fault: ${keys[col[i]]}</strong>`, [keys, col]);

  const map = renderMap({
    rows: mapRows,
    colorBy: {
      title: "At fault (click to hide)",
      items: OUTCOMES.map((o) => ({ key: o, color: COLORS[o], off: off.includes(o) })),
      onToggle: toggle,
      colorFor,
      rankFor: rank,
      popupExtra,
    },
  });

  const when = yearLabel(filters.yearRange);
  const full = view === "faultFull";
  const reasonsTruck = summary ? (full ? summary.top_reasons_truck : summary.geometry_view.top_patterns_truck) : {};
  const reasonsOther = summary ? (full ? summary.top_reasons_other : summary.geometry_view.top_patterns_other) : {};

  const kpis = (
    <>
      <div className="fault-view" role="group" aria-label="Fault view">
        <button type="button" className={!full ? "is-on" : undefined} onClick={() => setView("faultGeo")}>
          Geometry only
        </button>
        <button type="button" className={full ? "is-on" : undefined} onClick={() => setView("faultFull")}>
          Full (with driver records)
        </button>
      </div>
      <Indicator size="lg" label="Crashes scored" value={fmt(scored.length)} sub={`two-vehicle truck vs. non-truck · ${when}`} />
      <div className="kpi-pair">
        <Indicator label="Truck driver at fault" value={pct(counts["Truck driver"] ?? 0, scored.length)} color={COLORS["Truck driver"]} sub={fmt(counts["Truck driver"] ?? 0)} />
        <Indicator
          label="Non-truck driver at fault"
          value={pct(counts["Non-truck driver"] ?? 0, scored.length)}
          color={COLORS["Non-truck driver"]}
          sub={fmt(counts["Non-truck driver"] ?? 0)}
        />
      </div>
      <div className="kpi-pair">
        <Indicator label="Equal fault" value={pct(counts["Equal fault"] ?? 0, scored.length)} color={COLORS["Equal fault"]} sub={fmt(counts["Equal fault"] ?? 0)} />
        <Indicator label="Undetermined" value={pct(counts.Undetermined ?? 0, scored.length)} color={COLORS.Undetermined} sub={fmt(counts.Undetermined ?? 0)} />
      </div>
      <Callout>
        When one driver is at fault, it's the non-truck driver in{" "}
        <strong>{pct(counts["Non-truck driver"] ?? 0, attributed)}</strong> of crashes.
        <small>
          {full
            ? "Full view: driver records exist only for 2023–2025 in this extract, so it covers 151 crashes."
            : "Geometry view: uses how the two vehicles moved and hit. Weaker evidence, but fair to both drivers and available back to 2016."}{" "}
          Preliminary weights, pending review.
        </small>
      </Callout>
    </>
  );

  return (
    <DashboardGrid
      kpis={kpis}
      map={map}
      mapCaption={
        <>
          {full ? "Full view" : "Geometry-only view"} · {when} · {fmt(mapRows.length)} of {fmt(scored.length)} scored crashes shown
        </>
      }
      about={<About />}
      side={
        <>
          <Panel title="Who was at fault, by severity" note="Share of scored crashes in each severity bucket. Severity is never a scoring input.">
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySeverity} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow unit="%" stroke={axis} fontSize={11} />
                  <YAxis dataKey="label" type="category" width={150} stroke={axis} fontSize={11} />
                  <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {OUTCOMES.map((o) => (
                    <Bar key={o} dataKey={o} stackId="f" fill={COLORS[o]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Scored crashes by year">
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byYear} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="year" stroke={axis} fontSize={11} />
                  <YAxis stroke={axis} fontSize={11} />
                  <Tooltip contentStyle={tip} />
                  {OUTCOMES.map((o) => (
                    <Bar key={o} dataKey={o} stackId="y" fill={COLORS[o]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      }
      bottom={
        <Panel
          tabs={[
            {
              label: "Top reasons",
              content: (
                <div className="fault-reasons">
                  <ReasonList title="Truck drivers" color={COLORS["Truck driver"]} items={reasonsTruck} />
                  <ReasonList title="Non-truck drivers" color={COLORS["Non-truck driver"]} items={reasonsOther} />
                  <p className="panel__note">All years, before filters. How often each rule fired for that party.</p>
                </div>
              ),
            },
            {
              label: "Data coverage",
              content: summary ? <Coverage summary={summary} /> : <p>Run data/fault/score_fault.py to produce the summary.</p>,
            },
            {
              label: "Do the views agree?",
              content: summary ? (
                <div className="table-wrap">
                  <p className="panel__note">
                    On the {summary.in_scope} crashes both views score.{" "}
                    {Object.keys(summary.geometry_view.agreement_with_full_view).some(
                      (k) => k === "Truck driver | Non-truck driver" || k === "Non-truck driver | Truck driver"
                    )
                      ? "Some crashes point at opposite drivers; those need review."
                      : "They never point at opposite drivers."}{" "}
                    Partly by construction: the full view also uses geometry.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Full view | Geometry view</th>
                        <th>Crashes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary.geometry_view.agreement_with_full_view).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="tnum">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null,
            },
          ]}
        />
      }
    />
  );
}

function ReasonList({ title, color, items }: { title: string; color: string; items: Record<string, number> }) {
  const entries = Object.entries(items).slice(0, 8);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="reason-list">
      <h4 style={{ color }}>{title}</h4>
      <ul>
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="reason-list__name">{k}</span>
            <span className="reason-list__bar" style={{ width: `${(70 * v) / max}%`, background: color }} />
            <span className="reason-list__n tnum">{fmt(v)}</span>
          </li>
        ))}
        {!entries.length && <li className="reason-list__empty">None</li>}
      </ul>
    </div>
  );
}

function Coverage({ summary }: { summary: FaultSummary }) {
  const years = Object.keys(summary.funnel_by_year).filter((y) => y !== "unknown");
  return (
    <div className="table-wrap">
      <p className="panel__note">Why most crashes can't be scored with the full view (supervisor's 10/5 extract).</p>
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Crashes</th>
            <th>Full view scored</th>
            <th>No driver records</th>
            <th>One driver missing</th>
            <th>Not 2 vehicles</th>
            <th>No unit records</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const r = summary.funnel_by_year[y];
            const total = Object.values(r).reduce((a, b) => a + b, 0);
            const notTwo = (r["Single vehicle"] ?? 0) + (r["3+ vehicles"] ?? 0) + (r["Both vehicles commercial"] ?? 0) + (r["No commercial unit identified"] ?? 0);
            return (
              <tr key={y}>
                <td>{y}</td>
                <td className="tnum">{fmt(total)}</td>
                <td className="tnum">{fmt(r["In scope"] ?? 0)}</td>
                <td className="tnum">{fmt(r["No driver records"] ?? 0)}</td>
                <td className="tnum">{fmt(r["One driver record missing"] ?? 0)}</td>
                <td className="tnum">{fmt(notTwo)}</td>
                <td className="tnum">{fmt(r["No unit records"] ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function About() {
  return (
    <>
      <p>
        Who was at fault in two-vehicle crashes between a truck (commercial unit) and a non-truck vehicle, from a
        rule-based scorer. Each driver collects fault points; the higher score is at fault, scores within 0.15 are
        equal fault, and both under 0.2 is undetermined.
      </p>
      <h4>Inputs</h4>
      <ul>
        <li>Officer-coded driver action and citation (strongest)</li>
        <li>Alcohol, drugs, license status</li>
        <li>Maneuver and point of impact for both vehicles, e.g. striking the rear of a vehicle ahead</li>
        <li>Road surface explains crashes where neither driver is coded; it never adds points</li>
      </ul>
      <h4>Two views</h4>
      <p>
        <strong>Full</strong> uses everything but needs both drivers' records, which this extract has for only 151
        crashes (2023–2025). <strong>Geometry only</strong> uses the vehicle records alone, so it covers about 20,000
        crashes but rests on weaker evidence.
      </p>
      <h4>Caveats</h4>
      <ul>
        <li>Weights are a first draft (data/fault/rules.json), pending review against the reference paper.</li>
        <li>Missing data counts as unknown, never as not at fault.</li>
        <li>Severity is reported by bucket only. It is never an input: injuries follow vehicle mass, not fault.</li>
      </ul>
    </>
  );
}
