import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import { countBy, filterCrashes, fmt, totals, yearLabel } from "../lib/crashes";
import type { ModeProps } from "../lib/modeProps";
import { chartTheme } from "../lib/chartTheme";
import { SEVERITY_ORDER, severityColors } from "../lib/severity";
import DashboardGrid from "../components/DashboardGrid";
import { Callout, Gauge, Indicator, Panel } from "../components/Widgets";
import "./DataExploration.css";
import "./MannerOfCollision.css";

// Left out of the "most frequent / most injuries / most fatalities" sentence:
// they aren't a way two vehicles collided.
const NOT_A_MANNER = new Set(["Not Collision w/ Motor Vehicle in Transport", "Unknown", "Other"]);

export default function MannerOfCollision({ data, rows, filters, onChange, theme, renderMap }: ModeProps) {
  const SEVERITY_COLORS = severityColors(theme);
  const { axis, grid, tip, text } = chartTheme(theme);
  const selected = filters.lists.manner ?? [];

  // Picker counts ignore the manner selection itself, so unticked options still show their size.
  const pickerRows = useMemo(() => filterCrashes(data, filters, ["manner"]), [data, filters]);
  const pickerCounts = useMemo(() => countBy(data, pickerRows, "manner"), [data, pickerRows]);

  // The summary sentence follows the time frame (and a county focus) only, not the
  // other filters, so it always answers "which manner dominates here and when".
  const summary = useMemo(() => {
    const base = filterCrashes(data, filters, ["lists", "units", "fmcsa", "severityOff"]);
    const byManner = countBy(data, base, "manner").filter((r) => !NOT_A_MANNER.has(r.label));
    if (!byManner.length) return null;
    const top = (key: "count" | "injured" | "fatalities") => [...byManner].sort((a, b) => b[key] - a[key])[0];
    return { frequent: top("count"), injuries: top("injured"), fatalities: top("fatalities") };
  }, [data, filters]);

  const severity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of rows) {
      const k = data.keys.severity[data.cols.severity[i]];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return SEVERITY_ORDER.filter((k) => k !== "Unknown" && data.keys.severity.includes(k)).map((k) => ({
      severity: k,
      short: shortSeverity(k),
      count: counts.get(k) ?? 0,
    }));
  }, [data, rows]);

  const lethality = useMemo(() => {
    const fatalIdx = data.keys.severity.indexOf("Fatal");
    const m = new Map<string, { crashes: number; fatal: number; injured: number; fatalities: number }>();
    for (const i of pickerRows) {
      const k = data.keys.manner[data.cols.manner[i]];
      const r = m.get(k) ?? { crashes: 0, fatal: 0, injured: 0, fatalities: 0 };
      r.crashes++;
      if (data.cols.severity[i] === fatalIdx) r.fatal++;
      r.injured += data.cols.injured[i];
      r.fatalities += data.cols.fatalities[i];
      m.set(k, r);
    }
    return [...m.entries()].map(([manner, r]) => ({ manner, ...r })).sort((a, b) => b.crashes - a.crashes);
  }, [data, pickerRows]);

  const sum = useMemo(() => totals(data, rows), [data, rows]);
  const fatalCrashes = severity.find((s) => s.severity === "Fatal")?.count ?? 0;
  const when = yearLabel(filters.yearRange);
  const where = filters.county ? ` in ${filters.county} County` : " in Tennessee";

  const setManners = (manners: string[]) => onChange({ ...filters, lists: { ...filters.lists, manner: manners } });
  const toggle = (m: string) => setManners(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]);

  const kpis = (
    <>
      {summary && (
        <Callout>
          From {when}
          {where}, <strong>{summary.frequent.label}</strong> was the most frequent manner of collision (
          {fmt(summary.frequent.count)} crashes), <strong>{summary.injuries.label}</strong> caused the most injuries (
          {fmt(summary.injuries.injured)}) and <strong>{summary.fatalities.label}</strong> the most fatalities (
          {fmt(summary.fatalities.fatalities)}).
          <small>Follows the year range and county only, not the manner picker.</small>
        </Callout>
      )}
      <Indicator size="lg" label="Crashes" value={fmt(sum.crashes)} sub={selected.length ? "selected manners" : "all manners"} />
      <Gauge
        label="Fatal crashes"
        share={sum.crashes ? fatalCrashes / sum.crashes : 0}
        detail={`${fmt(fatalCrashes)} of ${fmt(sum.crashes)}`}
        color={SEVERITY_COLORS.Fatal}
        max={0.1}
      />
      <div className="kpi-pair">
        <Indicator label="Fatalities" value={fmt(sum.fatalities)} color={SEVERITY_COLORS.Fatal} />
        <Indicator label="People injured" value={fmt(sum.injured)} />
      </div>
    </>
  );

  return (
    <DashboardGrid
      kpis={kpis}
      map={renderMap()}
      mapCaption={
        <>
          {when} · {selected.length ? selected.join(", ") : "All manners"} · {fmt(rows.length)} crashes
        </>
      }
      about={
        <>
          <p>
            Pick one or more manners of collision to see where those crashes happened and how severe they were. The
            same selection is also under <em>Manner of collision</em> in the Filters panel, and it carries over to the
            other tabs.
          </p>
          <p>
            The sentence on the left ranks manners by crashes, injuries and fatalities for the chosen years and county.
            Crashes that weren't between two moving vehicles, and unknown or other manners, are left out of it.
          </p>
        </>
      }
      side={
        <>
          <Panel
            title="Manner of collision"
            actions={
              <div className="manner-picker__actions">
                <button type="button" onClick={() => setManners([])} disabled={!selected.length}>
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setManners(pickerCounts.map((r) => r.label).filter((l) => !NOT_A_MANNER.has(l)))}
                >
                  Vehicle-to-vehicle only
                </button>
              </div>
            }
            note={selected.length ? `${selected.length} selected. The map and charts show only these.` : "None selected = all manners."}
          >
            <ul className="manner-picker">
              {pickerCounts.map((r) => {
                const on = selected.includes(r.label);
                return (
                  <li key={r.label}>
                    <label className={on ? "is-on" : undefined}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.label)} />
                      <span className="manner-picker__name">{r.label}</span>
                      <span className="manner-picker__count">{fmt(r.count)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Severity distribution" note={`${selected.length ? selected.join(", ") : "All manners"} · least to most severe`}>
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severity} margin={{ top: 20, right: 6, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="short" stroke={axis} fontSize={11} interval={0} />
                  <YAxis stroke={axis} fontSize={11} />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => [fmt(Number(v)), "Crashes"]}
                    labelFormatter={(_, p) => (p?.[0]?.payload as { severity?: string } | undefined)?.severity ?? ""}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {severity.map((s) => (
                      <Cell key={s.severity} fill={SEVERITY_COLORS[s.severity]} />
                    ))}
                    <LabelList dataKey="count" position="top" fontSize={11} fill={text} formatter={(v) => fmt(Number(v))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      }
      bottom={
        <Panel title="How dangerous is each manner?" note="Share of crashes that were fatal shows lethality rather than volume.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manner</th>
                  <th>Crashes</th>
                  <th>Fatal crashes</th>
                  <th>Fatal share</th>
                  <th>Injured</th>
                  <th>Fatalities</th>
                </tr>
              </thead>
              <tbody>
                {lethality.map((r) => (
                  <tr key={r.manner} className={selected.includes(r.manner) ? "is-selected" : undefined}>
                    <td>{r.manner}</td>
                    <td className="tnum">{fmt(r.crashes)}</td>
                    <td className="tnum">{fmt(r.fatal)}</td>
                    <td className="tnum">{r.crashes ? `${((100 * r.fatal) / r.crashes).toFixed(1)}%` : "0%"}</td>
                    <td className="tnum">{fmt(r.injured)}</td>
                    <td className="tnum">{fmt(r.fatalities)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      }
    />
  );
}

function shortSeverity(label: string) {
  switch (label) {
    case "Property Damage (Under Threshold)":
      return "PDO (under)";
    case "Property Damage":
      return "PDO";
    case "Injury - Possible":
      return "Possible injury";
    case "Injury - Non-Incapacitating":
      return "Minor injury";
    case "Injury - Incapacitating":
      return "Serious injury";
    default:
      return label;
  }
}
