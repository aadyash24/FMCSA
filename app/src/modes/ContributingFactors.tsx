import { useCallback, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } from "recharts";
import { fmt, yearLabel } from "../lib/crashes";
import type { ModeProps } from "../lib/modeProps";
import { chartTheme } from "../lib/chartTheme";
import type { ResolvedTheme } from "../lib/theme";
import DashboardGrid from "../components/DashboardGrid";
import { Callout, Indicator, Panel } from "../components/Widgets";
import "./DataExploration.css";
import "./ContributingFactors.css";

/**
 * Contributing Factors (formerly At-Fault Analysis). Police no longer assign
 * fault; they list the factors coded for each driver. So this tab reads in
 * three steps, as agreed in the 10/15 meeting:
 *   1. which behaviors are coded in CMV crashes (speeding, distraction, ...)
 *   2. whose factors were coded: the CMV driver, the other driver, both, or none
 *   3. whether the behavior ranking changes between all drivers, CMV drivers
 *      and other drivers; the change points at training or enforcement targets
 *
 * Live data comes from data/fault/contributing_factors.py via crashes.json
 * (party, behCmv, behOther) and follows the shared filters. Until that has been
 * run, the tab shows a static statewide preview (factors_preview.json).
 */

/**
 * Behavior labels, in the bit order contributing_factors.py writes into behCmv / behOther.
 * Used when factors_meta.json is slow, stale or fails to load, so the charts are never blank.
 */
const DEFAULT_BEHAVIORS = [
  "Speeding",
  "Distraction / inattention",
  "Impairment (alcohol / drugs)",
  "Following too closely",
  "Lane or position error",
  "Failure to yield / obey controls",
  "Reckless / careless driving",
  "Improper turn or backing",
  "Other coded action",
  "Cited, other violation",
];

const PARTIES = ["CMV driver only", "Other driver only", "Both drivers", "No factor coded", "No driver record"] as const;

export interface FactorsPreview {
  source: string;
  caveat: string;
  behaviors: string[];
  actionsCmv: number[];
  actionsOther: number[];
  crashesByParty: Record<string, number>;
  bothNote: string;
}

export interface FactorsMeta {
  behaviors: { label: string }[];
  personDetail: boolean;
  source: string;
}

/** Scorer summary (data/fault/score_fault.py), kept for the "Preliminary scorer" view. */
export interface FaultSummary {
  rules_version: string;
  in_scope: number;
  funnel_by_year: Record<string, Record<string, number>>;
}

const SCORER_OUTCOMES = ["Truck driver", "Non-truck driver", "Equal fault", "Undetermined"] as const;
const OUT = "Out of scope";
const BUCKETS = ["Fatal", "Injury", "Property damage"] as const;

function partyColors(theme: ResolvedTheme): Record<string, string> {
  return theme === "dark"
    ? {
        "CMV driver only": "#f5a55f",
        "Other driver only": "#6b95ff",
        "Both drivers": "#b48bf0",
        "No factor coded": "#6f7784",
        "No driver record": "#454b55",
        "All drivers": "#9aa4b4",
        // scorer outcomes share the palette
        "Truck driver": "#f5a55f",
        "Non-truck driver": "#6b95ff",
        "Equal fault": "#b48bf0",
        Undetermined: "#6f7784",
      }
    : {
        "CMV driver only": "#d97706",
        "Other driver only": "#1d4ed8",
        "Both drivers": "#7c5cd6",
        "No factor coded": "#98a2b3",
        "No driver record": "#d0d5dd",
        "All drivers": "#667085",
        "Truck driver": "#d97706",
        "Non-truck driver": "#1d4ed8",
        "Equal fault": "#7c5cd6",
        Undetermined: "#98a2b3",
      };
}

/** Short axis labels for the comparison chart. */
const SHORT: [string, string][] = [
  ["Speeding", "Speeding"],
  ["Distraction", "Distraction"],
  ["Impairment", "Impairment"],
  ["Following", "Following"],
  ["Lane", "Lane/position"],
  ["Failure to yield", "Yield/controls"],
  ["Reckless", "Reckless"],
  ["Improper turn", "Turn/backing"],
  ["Other coded", "Other action"],
  ["Cited", "Other citation"],
];
const short = (label: string) => SHORT.find(([k]) => label.startsWith(k))?.[1] ?? label;

function bucket(label: string): (typeof BUCKETS)[number] | null {
  if (label === "Fatal") return "Fatal";
  if (label.startsWith("Injury")) return "Injury";
  if (label.startsWith("Property Damage")) return "Property damage";
  return null;
}

function pct(n: number, d: number) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "–";
}
const share = (n: number, d: number) => (d ? +((100 * n) / d).toFixed(1) : 0);

interface Factors {
  live: boolean;
  behaviors: string[];
  parties: Record<string, number>;
  /** Share (%) of each behavior for all drivers, CMV drivers, other drivers. */
  all: number[];
  cmv: number[];
  other: number[];
  /** Denominators, for tooltips and notes. */
  n: { all: number; cmv: number; other: number };
  unit: string;
}

interface FactorsProps extends ModeProps {
  summary: FaultSummary | null;
  preview: FactorsPreview | null;
  meta: FactorsMeta | null;
}

export default function ContributingFactors({ data, rows, filters, theme, renderMap, summary, preview, meta }: FactorsProps) {
  const { axis, grid, tip, text } = chartTheme(theme);
  const COLORS = partyColors(theme);
  const live = !!(data.cols.party && data.keys.party && data.cols.behCmv && data.cols.behOther);
  // Crashes with no driver records say nothing about factors, so they start hidden on the map.
  const [off, setOff] = useState<string[]>(() => (live ? ["No driver record"] : []));

  const factors = useMemo((): Factors | null => {
    if (live) {
      const keys = data.keys.party!;
      const partyCol = data.cols.party!;
      const behCmv = data.cols.behCmv!;
      const behOther = data.cols.behOther!;
      const metaLabels = meta?.behaviors?.map((b) => b.label) ?? [];
      const behaviors = metaLabels.length ? metaLabels : DEFAULT_BEHAVIORS;
      const B = behaviors.length;
      const parties: Record<string, number> = Object.fromEntries(PARTIES.map((p) => [p, 0]));
      const cAll = new Array(B).fill(0) as number[];
      const cCmv = new Array(B).fill(0) as number[];
      const cOther = new Array(B).fill(0) as number[];
      let nAll = 0;
      let nCmv = 0;
      let nOther = 0;
      for (const i of rows) {
        const p = keys[partyCol[i]];
        parties[p] = (parties[p] ?? 0) + 1;
        const cmvIn = p === "CMV driver only" || p === "Both drivers";
        const otherIn = p === "Other driver only" || p === "Both drivers";
        if (cmvIn) nCmv++;
        if (otherIn) nOther++;
        if (cmvIn || otherIn) nAll++;
        const a = behCmv[i];
        const o = behOther[i];
        for (let b = 0; b < B; b++) {
          const bit = 1 << b;
          if (a & bit) cCmv[b]++;
          if (o & bit) cOther[b]++;
          if ((a | o) & bit) cAll[b]++;
        }
      }
      return {
        live: true,
        behaviors,
        parties,
        all: cAll.map((c) => share(c, nAll)),
        cmv: cCmv.map((c) => share(c, nCmv)),
        other: cOther.map((c) => share(c, nOther)),
        n: { all: nAll, cmv: nCmv, other: nOther },
        unit: "of crashes where that driver had a factor coded",
      };
    }
    if (!preview) return null;
    const sCmv = preview.actionsCmv.reduce((a, b) => a + b, 0);
    const sOther = preview.actionsOther.reduce((a, b) => a + b, 0);
    return {
      live: false,
      behaviors: preview.behaviors,
      parties: preview.crashesByParty,
      all: preview.actionsCmv.map((c, b) => share(c + preview.actionsOther[b], sCmv + sOther)),
      cmv: preview.actionsCmv.map((c) => share(c, sCmv)),
      other: preview.actionsOther.map((c) => share(c, sOther)),
      n: { all: sCmv + sOther, cmv: sCmv, other: sOther },
      unit: "of coded driver actions",
    };
  }, [live, data, rows, meta, preview]);

  // ---- map ----------------------------------------------------------------
  // Live: color by contributing party. Preview: the preliminary scorer's geometry view.
  const mapKeys = live ? data.keys.party! : data.keys.faultGeo;
  const mapCol = live ? data.cols.party! : data.cols.faultGeo;
  const legendItems: readonly string[] = live ? PARTIES : SCORER_OUTCOMES;
  const outIdx = live ? -1 : data.keys.faultGeo.indexOf(OUT);
  const mapRows = useMemo(() => {
    const hidden = new Set(off.map((o) => mapKeys.indexOf(o)));
    return rows.filter((i) => mapCol[i] !== outIdx && !hidden.has(mapCol[i]));
  }, [rows, off, mapKeys, mapCol, outIdx]);
  const toggle = useCallback((o: string) => setOff((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])), []);
  const rank = useCallback((i: number) => {
    const k = mapKeys[mapCol[i]];
    return k === "No driver record" || k === "No factor coded" || k === "Undetermined" ? 0 : k === "Both drivers" || k === "Equal fault" ? 1 : 2;
  }, [mapKeys, mapCol]);
  const colorFor = useCallback((i: number) => COLORS[mapKeys[mapCol[i]]] ?? "#888", [COLORS, mapKeys, mapCol]);
  const popupExtra = useCallback(
    (i: number) => (live ? `<strong>Factors coded: ${mapKeys[mapCol[i]]}</strong>` : `Preliminary scorer: ${mapKeys[mapCol[i]]}`),
    [live, mapKeys, mapCol]
  );
  const map = renderMap({
    rows: mapRows,
    colorBy: {
      title: live ? "Whose factors were coded" : "Preliminary scorer (click to hide)",
      items: legendItems.map((o) => ({ key: o, color: COLORS[o], off: off.includes(o) })),
      onToggle: toggle,
      colorFor,
      rankFor: rank,
      popupExtra,
    },
  });

  // ---- preliminary scorer, kept as a cross-check ---------------------------
  const scorerBySeverity = useMemo(() => {
    const keys = data.keys.faultGeo;
    const col = data.cols.faultGeo;
    const t = BUCKETS.map((b) => ({ bucket: b, total: 0, ...Object.fromEntries(SCORER_OUTCOMES.map((o) => [o, 0])) })) as ({
      bucket: string;
      total: number;
    } & Record<string, number | string>)[];
    for (const i of rows) {
      if (keys[col[i]] === OUT) continue;
      const b = bucket(data.keys.severity[data.cols.severity[i]]);
      if (!b) continue;
      const r = t[BUCKETS.indexOf(b)];
      r[keys[col[i]]] = (r[keys[col[i]]] as number) + 1;
      r.total++;
    }
    return t.map((r) => ({
      ...r,
      label: `${r.bucket} (${fmt(r.total)})`,
      ...Object.fromEntries(SCORER_OUTCOMES.map((o) => [o, share(r[o] as number, r.total)])),
    }));
  }, [rows, data]);

  const when = yearLabel(filters.yearRange);
  if (!factors) return <div className="app-loading">Loading contributing factors…</div>;

  const P = factors.parties;
  // Shares are of crashes with driver records: a crash without them can't show whose factors were coded.
  const allCrashes = PARTIES.reduce((a, p) => a + (P[p] ?? 0), 0);
  const total = allCrashes - (P["No driver record"] ?? 0);
  const cmvContrib = (P["CMV driver only"] ?? 0) + (P["Both drivers"] ?? 0);
  const single = (P["CMV driver only"] ?? 0) + (P["Other driver only"] ?? 0);
  const unknown = P["No factor coded"] ?? 0;
  const scope = live ? when : "all years · not filtered";

  // Step 1: behaviors, most common first.
  const order = factors.behaviors.map((_, b) => b).sort((a, b) => factors.all[b] - factors.all[a]);
  const step1 = order.map((b) => ({ behavior: factors.behaviors[b], share: factors.all[b] }));
  // Step 2: parties.
  const step2 = PARTIES.filter((p) => p !== "No driver record").map((p) => ({ party: p, count: P[p] ?? 0, share: share(P[p] ?? 0, total) }));
  // Step 3: the three groups side by side, ordered by the overall ranking.
  const step3 = order.map((b) => ({
    behavior: factors.behaviors[b],
    "All drivers": factors.all[b],
    "CMV drivers": factors.cmv[b],
    "Other drivers": factors.other[b],
  }));
  const rankOf = (vals: number[]) => {
    const sorted = vals.map((v, b) => [v, b] as const).sort((a, b) => b[0] - a[0]);
    const r = new Array(vals.length).fill(0) as number[];
    sorted.forEach(([v, b], k) => (r[b] = v > 0 ? k + 1 : 0));
    return r;
  };
  const rAll = rankOf(factors.all);
  const rCmv = rankOf(factors.cmv);
  const rOther = rankOf(factors.other);
  const topCmv = factors.behaviors[rCmv.indexOf(1)];
  const topOther = factors.behaviors[rOther.indexOf(1)];

  const kpis = (
    <>
      <Indicator
        size="lg"
        label="Crashes with driver records"
        value={fmt(total)}
        sub={`${pct(total, allCrashes)} of ${fmt(allCrashes)} CMV crashes · ${scope}`}
      />
      <div className="kpi-pair">
        <Indicator label="CMV driver had a factor" value={pct(cmvContrib, total)} color={COLORS["CMV driver only"]} sub={fmt(cmvContrib)} />
        <Indicator label="Only the other driver" value={pct(P["Other driver only"] ?? 0, total)} color={COLORS["Other driver only"]} sub={fmt(P["Other driver only"] ?? 0)} />
      </div>
      <div className="kpi-pair">
        <Indicator label="Both drivers" value={pct(P["Both drivers"] ?? 0, total)} color={COLORS["Both drivers"]} sub={fmt(P["Both drivers"] ?? 0)} />
        <Indicator label="Nothing coded" value={pct(unknown, total)} color={COLORS["No factor coded"]} sub={fmt(unknown)} />
      </div>
      <Callout>
        When only one driver had a factor coded, it was the <strong>other (non-CMV) driver</strong> in{" "}
        <strong>{pct(P["Other driver only"] ?? 0, single)}</strong> of crashes.
        <small>
          This tests TDOT's assumption that most CMV vs. non-CMV crashes are caused by the other driver.{" "}
          {live ? "Officer-coded factors; no fault assigned." : "Preview from the full TITAN export; it won't follow the filters until the factors data is generated."}
        </small>
      </Callout>
    </>
  );

  const previewNote = !live && preview ? <p className="factor-preview">{preview.caveat}</p> : null;

  return (
    <DashboardGrid
      kpis={kpis}
      map={map}
      mapCaption={
        <>
          {live ? "Whose factors were coded" : "Preliminary scorer, geometry view"} · {when} · {fmt(mapRows.length)} crashes shown
        </>
      }
      about={<About live={live} meta={meta} />}
      side={
        <>
          <Panel
            title={<><span className="step-n">1</span> Behaviors coded in CMV crashes</>}
            note={`Share ${factors.unit}, any driver · ${scope}`}
          >
            {previewNote}
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={step1} layout="vertical" margin={{ left: 4, right: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis type="number" unit="%" stroke={axis} fontSize={11} />
                  <YAxis dataKey="behavior" type="category" width={190} stroke={axis} fontSize={10.5} interval={0} />
                  <Tooltip contentStyle={tip} formatter={(v) => [`${v}%`, "Share"]} />
                  <Bar dataKey="share" fill={COLORS["All drivers"]} radius={[0, 3, 3, 0]}>
                    <LabelList dataKey="share" position="right" fontSize={10.5} fill={text} formatter={(v) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel
            title={<><span className="step-n">2</span> Whose factors were coded</>}
            note={
              live
                ? `${scope} · share of the ${fmt(total)} crashes with driver records; ${fmt(P["No driver record"] ?? 0)} without are left out`
                : preview?.bothNote
            }
          >
            <div className="chart-fill">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={step2} layout="vertical" margin={{ left: 4, right: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis type="number" stroke={axis} fontSize={11} tickFormatter={(v) => fmt(Number(v))} />
                  <YAxis dataKey="party" type="category" width={130} stroke={axis} fontSize={11} interval={0} />
                  <Tooltip contentStyle={tip} formatter={(v) => [fmt(Number(v)), "Crashes"]} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {step2.map((s) => (
                      <Cell key={s.party} fill={COLORS[s.party]} />
                    ))}
                    <LabelList
                      dataKey="share"
                      position="right"
                      fontSize={10.5}
                      fill={text}
                      formatter={(v) => `${v}%`}
                    />
                  </Bar>
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
              label: "3 · Does the ranking change?",
              content: (
                <div className="factor-compare">
                  <div className="chart-fill">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={step3} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                        <XAxis dataKey="behavior" stroke={axis} fontSize={10} interval={0} tickFormatter={short} />
                        <YAxis unit="%" stroke={axis} fontSize={11} />
                        <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="All drivers" fill={COLORS["All drivers"]} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="CMV drivers" fill={COLORS["CMV driver only"]} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Other drivers" fill={COLORS["Other driver only"]} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="factor-ranks table-wrap">
                    <p className="panel__note">
                      Top for CMV drivers: <strong>{topCmv ?? "–"}</strong>. Top for other drivers:{" "}
                      <strong>{topOther ?? "–"}</strong>. A behavior that ranks higher for one group than overall is a
                      candidate for training or enforcement aimed at that group.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Behavior</th>
                          <th>All</th>
                          <th>CMV</th>
                          <th>Other</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.map((b) => (
                          <tr key={b}>
                            <td>{factors.behaviors[b]}</td>
                            <td className="tnum">{rAll[b] || "–"}</td>
                            <RankCell r={rCmv[b]} base={rAll[b]} />
                            <RankCell r={rOther[b]} base={rAll[b]} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            },
            {
              label: "Preliminary scorer",
              content: (
                <div className="factor-scorer">
                  <p className="panel__note">
                    Cross-check from the rule-based scorer (data/fault, geometry view, rules v{summary?.rules_version ?? "?"}):
                    which driver's maneuver and point of impact point to them, two-vehicle truck vs. non-truck crashes,
                    by severity. Severity is never a scoring input. Weights pending review.
                  </p>
                  <div className="chart-fill">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scorerBySeverity} layout="vertical" margin={{ left: 4, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow unit="%" stroke={axis} fontSize={11} />
                        <YAxis dataKey="label" type="category" width={150} stroke={axis} fontSize={11} />
                        <Tooltip contentStyle={tip} formatter={(v, n) => [`${v}%`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {SCORER_OUTCOMES.map((o) => (
                          <Bar key={o} dataKey={o} stackId="f" fill={COLORS[o]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
    />
  );
}

function RankCell({ r, base }: { r: number; base: number }) {
  if (!r) return <td className="tnum">–</td>;
  const d = base - r; // positive = ranks higher for this group than overall
  return (
    <td className="tnum">
      {r}
      {d !== 0 && base > 0 && <span className={`rank-move ${d > 0 ? "is-up" : "is-down"}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}
    </td>
  );
}

function About({ live, meta }: { live: boolean; meta: FactorsMeta | null }) {
  return (
    <>
      <p>
        Which driver behaviors police coded in CMV crashes, and for whom. Police no longer assign fault: they list the
        factors for each driver and leave fault to insurers and courts. This tab follows that practice.
      </p>
      <h4>How to read it</h4>
      <ul>
        <li>Step 1: which behaviors are coded most (speeding, distraction, impairment, ...).</li>
        <li>Step 2: whose factors were coded: only the CMV driver, only the other driver, both, or none.</li>
        <li>Step 3: whether the ranking changes between all drivers, CMV drivers and other drivers.</li>
      </ul>
      <h4>Data</h4>
      <ul>
        <li>Officer-coded driver actions (ActionCde), citations (ViolationCategoryCde) and, where available, alcohol and drug presence.</li>
        <li>Each code belongs to one behavior group; data/fault/contributing_factors.py lists them.</li>
        <li>Single-vehicle crashes count too: the CMV driver either had a factor coded or not.</li>
        {live ? (
          <li>
            Source: {meta?.source ?? "TITAN person tables"}.{" "}
            {meta && !meta.personDetail && "No person detail table, so impairment comes from citations only."}
          </li>
        ) : (
          <li>
            Showing a statewide preview. Run data/fault/contributing_factors.py, then data/prep_crash_data.py, to make the
            tab follow the filters.
          </li>
        )}
      </ul>
    </>
  );
}
