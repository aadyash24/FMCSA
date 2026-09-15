import { useMemo, useState } from "react";
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
import { useJson } from "../lib/useJson";
import type { CountRow, CountyRow, SeverityByYear, Summary, YearlyRow } from "../lib/types";
import StatCard from "../components/StatCard";
import "./DataExploration.css";

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#b42318",
  "Injury - Incapacitating": "#e04f16",
  "Injury - Non-Incapacitating": "#f0883e",
  "Injury - Possible": "#f5b84f",
  "Property Damage": "#94a3b8",
  "Property Damage (Under Threshold)": "#cbd5e1",
  Unknown: "#c9ccd1",
};

const PALETTE = ["#c2410c", "#6b7280", "#e0a83e", "#3a7ca5", "#8f7fc9", "#5a9367", "#c95d63", "#b8b0e0"];

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default function DataExploration() {
  const { data: summary } = useJson<Summary>("summary.json");
  const { data: yearly } = useJson<YearlyRow[]>("yearly.json");
  const { data: severityByYear } = useJson<SeverityByYear>("severity_by_year.json");
  const { data: manner } = useJson<CountRow[]>("manner.json");
  const { data: weather } = useJson<CountRow[]>("weather.json");
  const { data: light } = useJson<CountRow[]>("light.json");
  const { data: route } = useJson<CountRow[]>("route.json");
  const { data: county } = useJson<CountyRow[]>("county.json");

  const allYears = useMemo(() => (yearly ?? []).map((y) => y.year), [yearly]);
  const [range, setRange] = useState<[string, string] | null>(null);
  const [fromYear, toYear] = range ?? [allYears[0] ?? "", allYears[allYears.length - 1] ?? ""];

  const filteredYearly = useMemo(() => {
    if (!yearly) return [];
    return yearly.filter((y) => y.year >= fromYear && y.year <= toYear);
  }, [yearly, fromYear, toYear]);

  const filteredSeverity = useMemo(() => {
    if (!severityByYear) return [];
    return severityByYear.series.filter((s) => {
      const y = String(s.year);
      return y >= fromYear && y <= toYear;
    });
  }, [severityByYear, fromYear, toYear]);

  const totals = useMemo(() => {
    return filteredYearly.reduce(
      (acc, y) => {
        acc.crashes += y.crashes;
        acc.fatalities += y.fatalities;
        acc.injured += y.injured;
        return acc;
      },
      { crashes: 0, fatalities: 0, injured: 0 }
    );
  }, [filteredYearly]);

  return (
    <div className="data-exploration">
      <div className="data-exploration__controls">
        <label>
          From
          <select value={fromYear} onChange={(e) => setRange([e.target.value, toYear])}>
            {allYears.map((y) => (
              <option key={y} value={y} disabled={y > toYear}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={toYear} onChange={(e) => setRange([fromYear, e.target.value])}>
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
      </div>

      <div className="stat-row">
        <StatCard label="CMV crashes" value={fmt(totals.crashes)} sub={`${fromYear}–${toYear}`} />
        <StatCard label="Fatalities" value={fmt(totals.fatalities)} sub={`${fromYear}–${toYear}`} />
        <StatCard label="People injured" value={fmt(totals.injured)} sub={`${fromYear}–${toYear}`} />
        {summary && (
          <StatCard
            label="Full dataset span"
            value={`${summary.yearRange[0]}–${summary.yearRange[1]}`}
            sub={`${fmt(summary.totalCrashes)} crashes total`}
          />
        )}
      </div>

      <section className="panel">
        <h3>CMV crashes by year</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredYearly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={12} />
            <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={12} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
            <Legend />
            <Bar yAxisId="left" dataKey="crashes" name="Crashes" fill="#c2410c" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="fatalities" name="Fatalities" stroke="#b42318" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h3>Crash severity by year</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={filteredSeverity}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={12} />
            <YAxis stroke="var(--text-muted)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
            <Legend />
            {(severityByYear?.keys ?? []).map((key) => (
              <Bar key={key} dataKey={key} stackId="severity" fill={SEVERITY_COLORS[key] ?? "#999"} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="panel-grid">
        <section className="panel">
          <h3>Manner of collision</h3>
          <p className="panel__note">Full dataset, 2015–2025</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={manner ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
              <YAxis dataKey="manner" type="category" width={160} stroke="var(--text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="#c2410c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Route type</h3>
          <p className="panel__note">Full dataset, 2015–2025</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={route ?? []}
                dataKey="count"
                nameKey="route"
                cx="38%"
                cy="50%"
                outerRadius={85}
              >
                {(route ?? []).map((r, i) => (
                  <Cell key={r.route as string} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Weather at time of crash</h3>
          <p className="panel__note">Full dataset, 2015–2025</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weather ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
              <YAxis dataKey="weather" type="category" width={130} stroke="var(--text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="#6b7280" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Light condition</h3>
          <p className="panel__note">Full dataset, 2015–2025</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={light ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
              <YAxis dataKey="condition" type="category" width={130} stroke="var(--text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="#3a7ca5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="panel">
        <h3>Crashes by county</h3>
        <p className="panel__note">Full dataset, 2015–2025 · top 15 of 95 counties</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>County</th>
                <th>Crashes</th>
                <th>Fatalities</th>
                <th>Injured</th>
              </tr>
            </thead>
            <tbody>
              {(county ?? []).slice(0, 15).map((row) => (
                <tr key={row.county}>
                  <td>{row.county}</td>
                  <td>{fmt(row.crashes)}</td>
                  <td>{fmt(row.fatalities)}</td>
                  <td>{fmt(row.injured)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
