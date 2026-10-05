import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { countBy, countByInt, crossTab, fmt, indicatorCounts, partialYearNote, totals, yearLabel } from "../lib/crashes";
import type { ModeProps } from "../lib/modeProps";
import { chartTheme } from "../lib/chartTheme";
import { SEVERITY_ORDER, categoricalPalette, severityColors } from "../lib/severity";
import DashboardGrid from "../components/DashboardGrid";
import { Gauge, Indicator, Panel } from "../components/Widgets";
import "./DataExploration.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SERIOUS = "Injury - Incapacitating";

function pct(n: number, total: number) {
  return total ? `${((100 * n) / total).toFixed(1)}%` : "0%";
}

/** Count of rows whose list field equals `value`. */
function countWhere(data: ModeProps["data"], rows: number[], field: "workZone" | "intersection" | "schoolBus", value = "Yes") {
  const k = data.keys[field].indexOf(value);
  let n = 0;
  for (const i of rows) if (data.cols[field][i] === k) n++;
  return n;
}

export default function DataExploration({ data, rows, filters, theme, renderMap }: ModeProps) {
  const SEV = severityColors(theme);
  const PALETTE = categoricalPalette(theme);
  const { axis, grid, tip } = chartTheme(theme);

  const sum = useMemo(() => totals(data, rows), [data, rows]);
  const scope = `${yearLabel(filters.yearRange)} · ${filters.county ? `${filters.county} County` : "statewide"}`;
  const severityKeys = useMemo(() => SEVERITY_ORDER.filter((k) => data.keys.severity.includes(k)), [data]);

  const bySeverity = useMemo(() => new Map(countBy(data, rows, "severity").map((r) => [r.label, r.count])), [data, rows]);
  const fatalCrashes = bySeverity.get("Fatal") ?? 0;
  const seriousCrashes = bySeverity.get(SERIOUS) ?? 0;

  const tiles = useMemo(
    () => ({
      workZone: countWhere(data, rows, "workZone"),
      intersection: countWhere(data, rows, "intersection"),
      schoolBus: countWhere(data, rows, "schoolBus"),
    }),
    [data, rows]
  );

  const fatalSeriousByYear = useMemo(() => {
    const fatal = data.keys.severity.indexOf("Fatal");
    const serious = data.keys.severity.indexOf(SERIOUS);
    const m = new Map<string, { year: string; Fatal: number; "Serious injury": number; All: number }>();
    for (const i of rows) {
      const y = String(data.cols.year[i]);
      const r = m.get(y) ?? { year: y, Fatal: 0, "Serious injury": 0, All: 0 };
      if (data.cols.severity[i] === fatal) r.Fatal++;
      if (data.cols.severity[i] === serious) r["Serious injury"]++;
      r.All++;
      m.set(y, r);
    }
    return [...m.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [data, rows]);

  const byHour = useMemo(
    () => countByInt(data, rows, "hour", 24).map((n, h) => ({ label: `${h}`, count: n })),
    [data, rows]
  );
  const byDay = useMemo(() => countByInt(data, rows, "dow", 7).map((n, d) => ({ label: DAYS[d], count: n })), [data, rows]);
  const byMonth = useMemo(
    () => countByInt(data, rows, "month", 12, 1).map((n, m) => ({ label: MONTHS[m], count: n })),
    [data, rows]
  );

  const severityByManner = useMemo(
    () => crossTab(data, rows, "manner", "severity").sort((a, b) => rowTotal(b, severityKeys) - rowTotal(a, severityKeys)),
    [data, rows, severityKeys]
  );
  const severityByRoute = useMemo(
    () => crossTab(data, rows, "route", "severity").sort((a, b) => rowTotal(b, severityKeys) - rowTotal(a, severityKeys)),
    [data, rows, severityKeys]
  );

  const fmcsaTypes = useMemo(() => {
    const towed = indicatorCounts(data, rows, "towed");
    const inj = indicatorCounts(data, rows, "injTrans");
    let fatal = 0;
    const fatalIdx = data.keys.severity.indexOf("Fatal");
    for (const i of rows) if (data.cols.severity[i] === fatalIdx || data.cols.fatalities[i] > 0) fatal++;
    return [
      { type: "Fatal", Yes: fatal, No: rows.length - fatal, "Not recorded": 0 },
      { type: "Vehicle towed", Yes: towed.yes, No: towed.no, "Not recorded": towed.notRecorded },
      { type: "Injured transported", Yes: inj.yes, No: inj.no, "Not recorded": inj.notRecorded },
    ];
  }, [data, rows]);

  const surface = useMemo(() => countBy(data, rows, "surface"), [data, rows]);
  const weather = useMemo(() => countBy(data, rows, "weather"), [data, rows]);
  const county = useMemo(() => countBy(data, rows, "county"), [data, rows]);

  const countTip = (value: unknown) => [`${fmt(Number(value))} (${pct(Number(value), rows.length)})`, "Crashes"];
  const partial = partialYearNote(data, filters.yearRange);

  const columnChart = (d: { label: string; count: number }[], color: string, interval?: number) => (
    <div className="chart-fill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={d} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={11} interval={interval ?? 0} />
          <YAxis stroke={axis} fontSize={11} />
          <Tooltip contentStyle={tip} formatter={countTip} />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const stackedBySeverity = (d: Record<string, string | number>[], key: string, width: number) => (
    <div className="chart-fill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={d} layout="vertical" margin={{ top: 4, right: 10, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
          <XAxis type="number" stroke={axis} fontSize={11} />
          <YAxis dataKey={key} type="category" width={width} stroke={axis} fontSize={10.5} interval={0} tickFormatter={shortLabel} />
          <Tooltip contentStyle={tip} />
          <Legend wrapperStyle={{ fontSize: 10.5 }} />
          {severityKeys.map((k) => (
            <Bar key={k} dataKey={k} stackId="sev" fill={SEV[k] ?? PALETTE[7]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const kpis = (
    <>
      <Indicator size="lg" label="CMV crashes" value={fmt(sum.crashes)} sub={scope} />
      <div className="kpi-pair">
        <Indicator label="Work zone related" value={fmt(tiles.workZone)} sub={pct(tiles.workZone, sum.crashes)} />
        <Indicator label="Intersection related" value={fmt(tiles.intersection)} sub={pct(tiles.intersection, sum.crashes)} />
      </div>
      <div className="kpi-pair">
        <Indicator label="School bus related" value={fmt(tiles.schoolBus)} sub={pct(tiles.schoolBus, sum.crashes)} />
        <Indicator label="People injured" value={fmt(sum.injured)} />
      </div>
      <div className="kpi-pair">
        <Gauge
          label="Fatal crashes"
          share={sum.crashes ? fatalCrashes / sum.crashes : 0}
          detail={`${fmt(fatalCrashes)} crashes`}
          color={SEV.Fatal}
          max={0.1}
        />
        <Indicator label="Fatalities" value={fmt(sum.fatalities)} color={SEV.Fatal} sub="people killed" />
      </div>
      <div className="kpi-pair">
        <Gauge
          label="Serious injury crashes"
          share={sum.crashes ? seriousCrashes / sum.crashes : 0}
          detail={`${fmt(seriousCrashes)} crashes`}
          color={SEV[SERIOUS]}
          max={0.1}
        />
        <Indicator label="Serious injury crashes" value={fmt(seriousCrashes)} color={SEV[SERIOUS]} sub="suspected serious" />
      </div>
    </>
  );

  if (rows.length === 0) {
    return (
      <DashboardGrid
        kpis={kpis}
        map={renderMap()}
        about={<About />}
        side={<Panel title="No crashes">No crashes match these filters. Widen the year range or clear a filter.</Panel>}
        bottom={null}
      />
    );
  }

  return (
    <DashboardGrid
      kpis={kpis}
      map={renderMap()}
      mapCaption={
        <>
          Start: <strong>{filters.yearRange[0]}</strong> · End: <strong>{filters.yearRange[1]}</strong> ·{" "}
          {filters.county ? `${filters.county} County` : "Statewide"} · {fmt(rows.length)} crashes
        </>
      }
      about={<About />}
      side={
        <>
          <Panel title="Fatal and serious injury crashes by year" note={partial ?? undefined} className="grow-2">
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fatalSeriousByYear} margin={{ top: 6, right: 0, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="year" stroke={axis} fontSize={11} />
                  <YAxis yAxisId="l" stroke={axis} fontSize={11} />
                  <YAxis yAxisId="r" orientation="right" stroke={axis} fontSize={11} />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="Serious injury" stackId="fs" fill={SEV[SERIOUS]} />
                  <Bar yAxisId="l" dataKey="Fatal" stackId="fs" fill={SEV.Fatal} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="All" name="All crashes (right axis)" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel
            tabs={[
              { label: "Hour of day", content: columnChart(byHour, PALETTE[0], 2) },
              { label: "Day of week", content: columnChart(byDay, PALETTE[1]) },
              { label: "Month", content: columnChart(byMonth, PALETTE[2]) },
            ]}
          />
        </>
      }
      bottom={
        <>
          <Panel
            className="grow-2"
            tabs={[
              { label: "Severity by manner", content: stackedBySeverity(severityByManner, "manner", 170) },
              { label: "Severity by route class", content: stackedBySeverity(severityByRoute, "route", 110) },
              {
                label: "FMCSA criteria",
                content: (
                  <div className="chart-fill">
                    {fmcsaTypes[1]["Not recorded"] > 0.25 * rows.length && (
                      <p className="panel__warn">
                        Towed is blank on {pct(fmcsaTypes[1]["Not recorded"], rows.length)} of these crashes (mostly
                        unrecorded from 2021 on), so the towed criterion undercounts recent years.
                      </p>
                    )}
                    <ResponsiveContainer width="100%" height="85%">
                      <BarChart data={fmcsaTypes} layout="vertical" margin={{ left: 4, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={11} />
                        <YAxis dataKey="type" type="category" width={130} stroke={axis} fontSize={11} />
                        <Tooltip
                          contentStyle={tip}
                          formatter={(v, name) => [`${fmt(Number(v))} (${pct(Number(v), rows.length)})`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Yes" stackId="t" fill={PALETTE[3]} />
                        <Bar dataKey="No" stackId="t" fill={PALETTE[0]} fillOpacity={0.35} />
                        <Bar dataKey="Not recorded" stackId="t" fill={PALETTE[7]} fillOpacity={0.45} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              },
              {
                label: "Weather",
                content: (
                  <div className="chart-fill">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weather} layout="vertical" margin={{ left: 4, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={11} />
                        <YAxis dataKey="label" type="category" width={140} stroke={axis} fontSize={10.5} interval={0} />
                        <Tooltip contentStyle={tip} formatter={countTip} />
                        <Bar dataKey="count" fill={PALETTE[1]} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              },
              {
                label: "Counties",
                content: (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>County</th>
                          <th>Crashes</th>
                          <th>Share</th>
                          <th>Fatalities</th>
                          <th>Injured</th>
                        </tr>
                      </thead>
                      <tbody>
                        {county.slice(0, 25).map((row) => (
                          <tr key={row.label}>
                            <td>{row.label}</td>
                            <td className="tnum">{fmt(row.count)}</td>
                            <td className="tnum">{pct(row.count, rows.length)}</td>
                            <td className="tnum">{fmt(row.fatalities)}</td>
                            <td className="tnum">{fmt(row.injured)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              },
            ]}
          />
          <Panel title="Road surface condition">
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={surface} dataKey="count" nameKey="label" cx="40%" cy="50%" outerRadius="78%" innerRadius="45%">
                    {surface.map((r, i) => (
                      <Cell key={r.label} fill={r.label === "Not recorded" ? PALETTE[7] : PALETTE[i % 7]} />
                    ))}
                  </Pie>
                  <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tip} formatter={countTip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      }
    />
  );
}

/** Keeps long category names on one axis line, e.g. "Not Collision w/ Motor Vehicle in Transport". */
function shortLabel(v: string) {
  return v.length > 26 ? `${v.slice(0, 24)}…` : v;
}

function rowTotal(r: Record<string, string | number>, keys: string[]) {
  return keys.reduce((s, k) => s + (Number(r[k]) || 0), 0);
}

function About() {
  return (
    <>
      <p>
        This view shows Tennessee crashes that involved a commercial motor vehicle (CMV), 2015 to 2025, from the TITAN
        crash database. Every chart, tile and the map follow the filters (open them with the Filters button).
      </p>
      <h4>Commercial motor vehicle</h4>
      <ul>
        <li>a vehicle over 10,000 lb gross weight rating used to carry property, or</li>
        <li>a vehicle designed to carry more than eight people including the driver, or</li>
        <li>any vehicle displaying a hazardous materials placard.</li>
      </ul>
      <h4>FMCSA reportable crash</h4>
      <p>
        A CMV crash is reportable to FMCSA when it results in a fatality, an injured person transported for immediate
        medical treatment, or a vehicle towed from the scene. The <em>FMCSA reportable criteria</em> filter applies
        these. The towed field is mostly blank from 2021 on, so that criterion undercounts recent years.
      </p>
      <h4>Notes</h4>
      <ul>
        <li>Severity is the most severe injury in the crash (KABCO scale).</li>
        <li>Road surface comes from the unit records, which are missing for most of 2015 and half of 2016.</li>
        <li>Click a county on the map to focus every chart on it.</li>
      </ul>
    </>
  );
}
