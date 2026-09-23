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
import { useJson } from "../lib/useJson";
import type { CountRow, CountyRow, SeverityByYear, Summary, YearlyRow, YearRange } from "../lib/types";
import type { ResolvedTheme } from "../lib/theme";
import { categoricalPalette, severityColors } from "../lib/severity";
import StatCard from "../components/StatCard";
import "./DataExploration.css";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

interface DataExplorationProps {
  yearRange: YearRange;
  theme: ResolvedTheme;
}

export default function DataExploration({ yearRange, theme }: DataExplorationProps) {
  const SEVERITY_COLORS = severityColors(theme);
  const PALETTE = categoricalPalette(theme);
  // Recharts needs literal colors, so the CSS variables are mirrored here.
  const axis = theme === "dark" ? "#9aa4b4" : "#667085";
  const grid = theme === "dark" ? "#212734" : "#eceff3";
  const tip = {
    background: theme === "dark" ? "#171b23" : "#ffffff",
    border: `1px solid ${theme === "dark" ? "#242a35" : "#e4e7ec"}`,
    borderRadius: 8,
    color: theme === "dark" ? "#e7eaf0" : "#101828",
    fontSize: 12,
    boxShadow: theme === "dark"
      ? "0 4px 14px -2px rgb(0 0 0 / 0.5)"
      : "0 4px 12px -2px rgb(16 24 40 / 0.1)",
  };
  const { data: summary } = useJson<Summary>("summary.json");
  const { data: yearly } = useJson<YearlyRow[]>("yearly.json");
  const { data: severityByYear } = useJson<SeverityByYear>("severity_by_year.json");
  const { data: manner } = useJson<CountRow[]>("manner.json");
  const { data: weather } = useJson<CountRow[]>("weather.json");
  const { data: light } = useJson<CountRow[]>("light.json");
  const { data: route } = useJson<CountRow[]>("route.json");
  const { data: county } = useJson<CountyRow[]>("county.json");

  const [fromYear, toYear] = yearRange;

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
      <div className="stat-row">
        <StatCard label="CMV crashes" value={fmt(totals.crashes)} sub={`${fromYear}-${toYear}`} />
        <StatCard label="Fatalities" value={fmt(totals.fatalities)} sub={`${fromYear}-${toYear}`} />
        <StatCard label="People injured" value={fmt(totals.injured)} sub={`${fromYear}-${toYear}`} />
        {summary && (
          <StatCard
            label="Full dataset span"
            value={`${summary.yearRange[0]}-${summary.yearRange[1]}`}
            sub={`${fmt(summary.totalCrashes)} crashes total`}
          />
        )}
      </div>

      <section className="panel">
        <h3>CMV crashes by year</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredYearly}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="year" stroke={axis} fontSize={12} />
            <YAxis yAxisId="left" stroke={axis} fontSize={12} />
            <YAxis yAxisId="right" orientation="right" stroke={axis} fontSize={12} />
            <Tooltip contentStyle={tip} />
            <Legend />
            <Bar yAxisId="left" dataKey="crashes" name="Crashes" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="fatalities" name="Fatalities" stroke={SEVERITY_COLORS.Fatal} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h3>Crash severity by year</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={filteredSeverity}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="year" stroke={axis} fontSize={12} />
            <YAxis stroke={axis} fontSize={12} />
            <Tooltip contentStyle={tip} />
            <Legend />
            {(severityByYear?.keys ?? []).map((key) => (
              <Bar key={key} dataKey={key} stackId="severity" fill={SEVERITY_COLORS[key] ?? PALETTE[7]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="panel-grid">
        <section className="panel">
          <h3>Manner of collision</h3>
          <p className="panel__note">Full dataset, all years</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={manner ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis type="number" stroke={axis} fontSize={12} />
              <YAxis dataKey="manner" type="category" width={160} stroke={axis} fontSize={11} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Route type</h3>
          <p className="panel__note">Full dataset, all years</p>
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
              <Tooltip contentStyle={tip} />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Weather at time of crash</h3>
          <p className="panel__note">Full dataset, all years</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weather ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis type="number" stroke={axis} fontSize={12} />
              <YAxis dataKey="weather" type="category" width={130} stroke={axis} fontSize={11} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" fill={PALETTE[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <h3>Light condition</h3>
          <p className="panel__note">Full dataset, all years</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={light ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis type="number" stroke={axis} fontSize={12} />
              <YAxis dataKey="condition" type="category" width={130} stroke={axis} fontSize={11} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" fill={PALETTE[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="panel">
        <h3>Crashes by county</h3>
        <p className="panel__note">Full dataset, all years · top 15 of 95 counties</p>
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
                  <td className="tnum">{fmt(row.crashes)}</td>
                  <td className="tnum">{fmt(row.fatalities)}</td>
                  <td className="tnum">{fmt(row.injured)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
