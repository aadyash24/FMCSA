import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  Cell,
  LabelList,
} from "recharts";
import { countBy, fmt, totals, yearLabel } from "../lib/crashes";
import type { CorridorClass, CorridorData, CorridorRoute } from "../lib/corridors";
import { CORRIDOR_CLASSES, matchCorridor } from "../lib/corridors";
import type { ModeProps } from "../lib/modeProps";
import { chartTheme } from "../lib/chartTheme";
import { SEVERITY_ORDER, categoricalPalette, severityColors } from "../lib/severity";
import DashboardGrid from "../components/DashboardGrid";
import { Callout, Indicator, Panel } from "../components/Widgets";
import "./DataExploration.css";
import "./CorridorAnalysis.css";

const BIN_SIZES = [1, 2, 5];

/** Three severity groups keep a long profile readable. */
function severityGroup(label: string): "Fatal" | "Injury" | "Property damage" | null {
  if (label === "Fatal") return "Fatal";
  if (label.startsWith("Injury")) return "Injury";
  if (label.startsWith("Property Damage")) return "Property damage";
  return null;
}

interface CorridorProps extends ModeProps {
  corridors: CorridorData | null;
}

export default function CorridorAnalysis({ data, rows, corridors, filters, theme, renderMap }: CorridorProps) {
  const { axis, grid, tip, text } = chartTheme(theme);
  const SEV = severityColors(theme);
  const PALETTE = categoricalPalette(theme);
  const [routeId, setRouteIdState] = useState<string | null>(null);
  const [routeClass, setRouteClass] = useState<CorridorClass>("Interstate");
  // Any way of opening a route (chip, table, map, search) also switches the class tabs to it.
  const setRouteId = (id: string | null) => {
    const hit = id ? corridors?.routes.find((r) => r.id === id) : null;
    if (id && !hit) return; // a placeholder fragment too short to profile
    if (hit) setRouteClass(hit.class);
    setRouteIdState(id);
  };
  const [binMi, setBinMi] = useState(2);
  const [query, setQuery] = useState("");

  // Filtered crashes per route, for the route table and the picker.
  const byRoute = useMemo(() => {
    if (!corridors) return [];
    const fatalIdx = data.keys.severity.indexOf("Fatal");
    const acc = corridors.routes.map((r) => ({ route: r, rows: [] as number[], fatal: 0 }));
    for (const i of rows) {
      const k = corridors.crashRoute[i];
      if (k < 0) continue;
      acc[k].rows.push(i);
      if (data.cols.severity[i] === fatalIdx) acc[k].fatal++;
    }
    return acc;
  }, [corridors, rows, data]);

  const inClass = useMemo(() => byRoute.filter((r) => r.route.class === routeClass), [byRoute, routeClass]);
  const current = byRoute.find((r) => r.route.id === routeId) ?? null;
  const currentRows = current?.rows;
  const route = current?.route ?? null;
  const sum = useMemo(() => totals(data, currentRows ?? inClass.flatMap((r) => r.rows)), [data, currentRows, inClass]);

  const profile = useMemo(() => {
    if (!route || !currentRows || !corridors) return [];
    const nBins = Math.ceil(route.lengthMi / binMi);
    const bins = Array.from({ length: nBins }, (_, b) => ({ mi: b * binMi, Fatal: 0, Injury: 0, "Property damage": 0, total: 0 }));
    for (const i of currentRows) {
      const m = corridors.crashMile[i];
      if (m === null) continue;
      const b = Math.min(nBins - 1, Math.floor(m / binMi));
      const g = severityGroup(data.keys.severity[data.cols.severity[i]]);
      if (g) bins[b][g]++;
      bins[b].total++;
    }
    return bins;
  }, [data, currentRows, corridors, route, binMi]);

  const severity = useMemo(() => {
    const c = countBy(data, currentRows ?? [], "severity");
    return SEVERITY_ORDER.filter((k) => k !== "Unknown").map((k) => ({ severity: k, count: c.find((r) => r.label === k)?.count ?? 0 }));
  }, [data, currentRows]);
  const manner = useMemo(() => countBy(data, currentRows ?? [], "manner"), [data, currentRows]);

  if (!corridors) return <div className="app-loading">Loading corridor data…</div>;

  const when = yearLabel(filters.yearRange);
  const pick = (value: string) => {
    setQuery(value);
    const hit = matchCorridor(corridors.routes, value);
    if (hit) setRouteId(hit.id);
  };
  const classLabel = CORRIDOR_CLASSES.find((c) => c.id === routeClass)!.label;
  const classNoun = classLabel.toLowerCase();

  const countyAt = (mi: number) => route?.counties.find((c) => mi >= c.fromMi && mi <= c.toMi + 0.25)?.county ?? "—";
  const metroAt = (mi: number) => route?.metros.find((m) => mi >= m.fromMi && mi <= m.toMi)?.name ?? null;
  const snapBin = (mi: number) => Math.floor(mi / binMi) * binMi;
  const hotspots = [...profile].filter((b) => b.total > 0).sort((a, b) => b.total - a.total).slice(0, 8);
  const ends = route?.direction === "west to east" ? ["west end", "east end"] : ["south end", "north end"];
  const perMile = [...inClass]
    .map((r) => ({ id: r.route.id, perMile: +(r.rows.length / r.route.lengthMi).toFixed(2) }))
    .sort((a, b) => b.perMile - a.perMile);

  const kpis = route ? (
    <>
      <Indicator size="lg" label={`Crashes on ${route.id}`} value={fmt(sum.crashes)} sub={when} />
      <Indicator label="Crashes per mile" value={(sum.crashes / route.lengthMi).toFixed(1)} sub={`${route.lengthMi.toFixed(0)} mi in TN`} />
      <div className="kpi-pair">
        <Indicator label="Fatalities" value={fmt(sum.fatalities)} color={SEV.Fatal} />
        <Indicator label="People injured" value={fmt(sum.injured)} />
      </div>
      <Callout>
        Preliminary: mileposts come from placeholder route lines until the TDOT Road Geometrics file is loaded.
      </Callout>
    </>
  ) : (
    <>
      <Indicator size="lg" label={`Crashes placed on ${classNoun}`} value={fmt(sum.crashes)} sub={when} />
      <Indicator label={classLabel} value={String(inClass.length)} sub="pick one to open its profile" />
      <div className="kpi-pair">
        <Indicator label="Fatalities" value={fmt(sum.fatalities)} color={SEV.Fatal} />
        <Indicator label="People injured" value={fmt(sum.injured)} />
      </div>
      <Callout>
        {routeClass === "Interstate"
          ? `Only crashes coded as on an interstate and within ${corridors.snapMiles} mi of the line are counted.`
          : `Crashes coded as on a US or state route within ${corridors.snapMiles} mi of the line are counted; the two codes are pooled because every TN US route also has a state route number.`}{" "}
        Filters still apply.
      </Callout>
    </>
  );

  const picker = (
    <Panel title="Pick a route" className="grow-0" note="Or click a route on the map.">
      <div className="corridor-classes" role="tablist" aria-label="Route class">
        {CORRIDOR_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === routeClass}
            className={`chip${c.id === routeClass ? " chip--on" : ""}`}
            onClick={() => {
              setRouteClass(c.id);
              if (route && route.class !== c.id) setRouteIdState(null);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        className="corridor-search"
        list="corridor-routes"
        placeholder="Type a route, e.g. I-40, US-70, SR-840"
        value={query}
        onChange={(e) => pick(e.target.value)}
        aria-label="Search routes"
      />
      <datalist id="corridor-routes">
        {corridors.routes.map((r) => (
          <option key={r.id} value={r.id} />
        ))}
      </datalist>
      <div className="corridor-chips">
        {inClass.map(({ route: r, rows: rr }) => (
          <button
            key={r.id}
            type="button"
            className={`chip${r.id === routeId ? " chip--on" : ""}`}
            onClick={() => (r.id === routeId ? setRouteIdState(null) : setRouteId(r.id))}
          >
            {r.id} <span className="corridor-chips__n">{fmt(rr.length)}</span>
          </button>
        ))}
      </div>
    </Panel>
  );

  const about = (
    <>
      <p>
        Each crash on an interstate, US route or state route is placed at a mile position along its route, so crashes
        can be read from one end of the route to the other, e.g. I-40 from Memphis to Bristol. Shaded bands on the
        profile are metro areas.
      </p>
      <p>
        US and state routes the placeholder only covers in scattered pieces are left out until the TDOT file arrives,
        since their mileposts would be meaningless. Raw counts rise with traffic, so city sections stand out on volume
        alone. Crash rates need traffic counts
        (AADT), which the geometrics file doesn't include. Mileposts are approximate until the TDOT Road Geometrics
        file replaces the placeholder lines.
      </p>
    </>
  );

  const map = renderMap({
    networkOnly: true,
    rows: currentRows ?? [],
    highlight: route ? { id: route.id, path: route.path } : null,
    onRouteClick: setRouteId,
  });

  if (!route) {
    return (
      <DashboardGrid
        kpis={kpis}
        map={map}
        about={about}
        mapCaption={<>{when} · click a route to open it</>}
        side={
          <>
            {picker}
            <RouteTable byRoute={inClass} onPick={setRouteId} when={when} title={`Crashes by ${classNoun.replace(/s$/, "")}`} />
          </>
        }
        bottom={
          <Panel title={`Crashes per mile by ${classNoun.replace(/s$/, "")}`} note={`${when} · unnormalized for traffic`}>
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perMile} margin={{ top: 18, right: 8, left: -8, bottom: perMile.length > 12 ? 18 : 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis
                    dataKey="id"
                    stroke={axis}
                    fontSize={perMile.length > 12 ? 10 : 11}
                    interval={0}
                    angle={perMile.length > 12 ? -45 : 0}
                    textAnchor={perMile.length > 12 ? "end" : "middle"}
                  />
                  <YAxis stroke={axis} fontSize={11} />
                  <Tooltip contentStyle={tip} formatter={(v) => [Number(v).toFixed(1), "Crashes per mile"]} />
                  <Bar dataKey="perMile" fill={PALETTE[0]} radius={[3, 3, 0, 0]} onClick={(d) => setRouteId(String((d as { id?: string }).id))}>
                    <LabelList dataKey="perMile" position="top" fontSize={10.5} fill={text} formatter={(v) => Number(v).toFixed(1)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        }
      />
    );
  }

  return (
    <DashboardGrid
      kpis={kpis}
      map={map}
      about={about}
      mapCaption={
        <>
          {route.id} · {when} · {fmt(sum.crashes)} crashes ·{" "}
          <button type="button" className="link-btn" onClick={() => setRouteId(null)}>
            back to all {classNoun}
          </button>
        </>
      }
      side={
        <>
          {picker}
          <Panel
            tabs={[
              {
                label: `Severity on ${route.id}`,
                content: (
                  <div className="chart-fill">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={severity} layout="vertical" margin={{ left: 4, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={11} />
                        <YAxis dataKey="severity" type="category" width={170} stroke={axis} fontSize={10.5} interval={0} />
                        <Tooltip contentStyle={tip} formatter={(v) => [fmt(Number(v)), "Crashes"]} />
                        <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                          {severity.map((s) => (
                            <Cell key={s.severity} fill={SEV[s.severity]} />
                          ))}
                          <LabelList dataKey="count" position="right" fontSize={10.5} fill={text} formatter={(v) => fmt(Number(v))} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              },
              {
                label: "Manner",
                content: (
                  <div className="chart-fill">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={manner} layout="vertical" margin={{ left: 4, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={11} />
                        <YAxis dataKey="label" type="category" width={170} stroke={axis} fontSize={10.5} interval={0} />
                        <Tooltip contentStyle={tip} formatter={(v) => [fmt(Number(v)), "Crashes"]} />
                        <Bar dataKey="count" fill={PALETTE[0]} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              },
              {
                label: "Busiest sections",
                content: (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>County</th>
                          <th>Metro</th>
                          <th>Crashes</th>
                          <th>Fatal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotspots.map((b) => (
                          <tr key={b.mi}>
                            <td>
                              Mile {b.mi}–{b.mi + binMi}
                            </td>
                            <td>{countyAt(b.mi + binMi / 2)}</td>
                            <td>{metroAt(b.mi + binMi / 2) ?? "—"}</td>
                            <td className="tnum">{fmt(b.total)}</td>
                            <td className="tnum">{fmt(b.Fatal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              },
            ]}
          />
        </>
      }
      bottom={
        <Panel
          title={`${route.id}, mile by mile`}
          note={`Crashes per ${binMi}-mile section from the ${ends[0]} (mile 0) to the ${ends[1]}. Shaded bands are metro areas. Raw counts, not rates.`}
          actions={
            <div className="corridor-bins" role="group" aria-label="Section length">
              {BIN_SIZES.map((b) => (
                <button key={b} type="button" className={`chip${b === binMi ? " chip--on" : ""}`} onClick={() => setBinMi(b)}>
                  {b} mi
                </button>
              ))}
            </div>
          }
        >
          <div className="chart-fill">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile} barCategoryGap={0} margin={{ top: 22, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                {route.metros.map((m) => (
                  <ReferenceArea
                    key={`${m.name}-${m.fromMi}`}
                    x1={snapBin(m.fromMi)}
                    x2={snapBin(Math.min(m.toMi, route.lengthMi - 0.01))}
                    fill={PALETTE[1]}
                    fillOpacity={0.14}
                    stroke="none"
                    label={{ value: m.name, position: "insideTop", fontSize: 10.5, fill: text, offset: -16 }}
                  />
                ))}
                <XAxis dataKey="mi" stroke={axis} fontSize={11} interval="preserveStartEnd" minTickGap={24} unit=" mi" />
                <YAxis stroke={axis} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={tip}
                  labelFormatter={(mi) => {
                    const m = Number(mi);
                    const metro = metroAt(m + binMi / 2);
                    return `Mile ${m}–${m + binMi} · ${countyAt(m + binMi / 2)} County${metro ? ` · ${metro}` : ""}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Property damage" stackId="p" fill={SEV["Property Damage"]} />
                <Bar dataKey="Injury" stackId="p" fill={SEV["Injury - Non-Incapacitating"]} />
                <Bar dataKey="Fatal" stackId="p" fill={SEV.Fatal} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      }
    />
  );
}

function RouteTable({
  byRoute,
  onPick,
  when,
  title,
}: {
  byRoute: { route: CorridorRoute; rows: number[]; fatal: number }[];
  onPick: (id: string) => void;
  when: string;
  title: string;
}) {
  const sorted = [...byRoute].sort((a, b) => b.rows.length / b.route.lengthMi - a.rows.length / a.route.lengthMi);
  return (
    <Panel title={title} note={`${when} · sorted by crashes per mile · click a row to open it`}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Miles in TN</th>
              <th>Crashes</th>
              <th>Per mile</th>
              <th>Fatal crashes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ route, rows, fatal }) => (
              <tr key={route.id} className="is-clickable" onClick={() => onPick(route.id)}>
                <td>{route.id}</td>
                <td className="tnum">{route.lengthMi.toFixed(0)}</td>
                <td className="tnum">{fmt(rows.length)}</td>
                <td className="tnum">{(rows.length / route.lengthMi).toFixed(1)}</td>
                <td className="tnum">{fmt(fatal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
