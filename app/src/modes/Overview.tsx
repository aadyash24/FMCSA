import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { chartTheme } from "../lib/chartTheme";
import type { ResolvedTheme } from "../lib/theme";
import { useJson } from "../lib/useJson";
import type { CrashData } from "../lib/crashes";
import { fmt, totals } from "../lib/crashes";
import type { DashboardMode } from "../lib/types";
import "./Overview.css";

interface TeamMember {
  name: string;
  role: string;
  affiliation?: string;
  /** Path under app/public, e.g. "team/jane.jpg". Empty shows initials. */
  photo?: string;
}

/** Output of data/prep_coverage.py. Null counts = not computed yet. */
interface Coverage {
  source: string;
  complete: boolean;
  crashes: number;
  vehicles: number | null;
  people: number | null;
  crashesWithVehicles: number | null;
  crashesWithPeople: number | null;
  byYear: {
    year: string;
    crashes: number;
    crashesWithVehicles: number | null;
    vehicles: number | null;
    crashesWithPeople: number | null;
    people: number | null;
  }[];
}

const SECTIONS: { mode: DashboardMode; title: string; body: string }[] = [
  {
    mode: "explore",
    title: "Exploratory Analysis",
    body: "Counts and frequencies of CMV crashes by year, severity, vehicles involved, FMCSA crash type, weather, light and county.",
  },
  {
    mode: "manner",
    title: "Manner of Collision",
    body: "Pick rear-end, angle, head-on and other collision types to see where they happen and how severe they are.",
  },
  {
    mode: "corridor",
    title: "Corridor Analysis",
    body: "Choose an interstate, US route or state route and follow its crashes mile by mile, end to end, with the busiest sections and metro areas marked.",
  },
  {
    mode: "factors",
    title: "Contributing Factors",
    body: "Which driver behaviors police coded (speeding, distraction, impairment), whether for the CMV driver or the other driver, and how the ranking shifts between them.",
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function Avatar({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  if (member.photo && !broken) {
    return (
      <img
        className="team-card__photo"
        src={`${import.meta.env.BASE_URL}${member.photo}`}
        alt={member.name}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="team-card__photo team-card__photo--initials" aria-hidden="true">
      {initials(member.name)}
    </div>
  );
}

export default function Overview({
  data,
  onOpen,
  tabs,
  theme,
}: {
  data: CrashData | null;
  onOpen: (m: DashboardMode) => void;
  /** Visible tabs; the rest are listed as in development (presentation mode). */
  tabs: DashboardMode[];
  theme: ResolvedTheme;
}) {
  const { data: team } = useJson<{ members: TeamMember[] }>("team.json");
  const { data: coverage } = useJson<Coverage>("coverage.json");

  const stats = useMemo(() => {
    if (!data) return null;
    const all = Array.from({ length: data.n }, (_, i) => i);
    const t = totals(data, all);
    const years = data.cols.year;
    let min = Infinity;
    let max = -Infinity;
    for (const y of years) {
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return { ...t, from: min, to: max };
  }, [data]);

  return (
    <div className="overview">
      <section className="overview-hero">
        <p className="overview-hero__eyebrow">FMCSA research project · Tennessee</p>
        <h2>Where, how and why commercial vehicles crash in Tennessee</h2>
        <p className="overview-hero__lead">
          This dashboard brings together a decade of police-reported crashes involving commercial motor vehicles
          (trucks and buses) in Tennessee. Use it to see how many crashes happen, how severe they are, how vehicles
          collide, which driver behaviors are coded, and which stretches of road see the most crashes.
        </p>
        {stats && (
          <div className="overview-stats">
            <div>
              <strong>{fmt(stats.crashes)}</strong>
              <span>CMV crashes</span>
            </div>
            <div>
              <strong>{fmt(stats.fatalities)}</strong>
              <span>people killed</span>
            </div>
            <div>
              <strong>{fmt(stats.injured)}</strong>
              <span>people injured</span>
            </div>
            <div>
              <strong>
                {stats.from}–{stats.to}
              </strong>
              <span>years covered</span>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="overview-h">What's inside</h3>
        <div className="overview-sections">
          {SECTIONS.map((s) =>
            tabs.includes(s.mode) ? (
              <button key={s.mode} type="button" className="overview-card" onClick={() => onOpen(s.mode)}>
                <span className="overview-card__title">{s.title}</span>
                <span className="overview-card__body">{s.body}</span>
                <span className="overview-card__go">Open →</span>
              </button>
            ) : (
              <div key={s.mode} className="overview-card is-wip">
                <span className="overview-card__title">
                  {s.title}
                  <span className="mode-tab__badge">in development</span>
                </span>
                <span className="overview-card__body">{s.body}</span>
                <span className="overview-card__go">Being fine-tuned, more charts by the next meeting</span>
              </div>
            )
          )}
        </div>
      </section>

      <section>
        <h3 className="overview-h">The team</h3>
        <div className="team-grid">
          {(team?.members ?? []).map((m) => (
            <div key={m.name} className="team-card">
              <Avatar member={m} />
              <div className="team-card__name">{m.name}</div>
              <div className="team-card__role">{m.role}</div>
              {m.affiliation && <div className="team-card__aff">{m.affiliation}</div>}
            </div>
          ))}
        </div>
      </section>

      {coverage && <CoverageSection coverage={coverage} theme={theme} />}

      <section className="overview-data">
        <h3 className="overview-h">About the data</h3>
        <ul>
          <li>
            Crashes: Tennessee TITAN crash reports involving a commercial motor vehicle, 2015–2025. Codes (severity,
            manner of collision, weather, light) follow the TITAN data dictionary.
          </li>
          <li>Highways: placeholder public roads data until the TDOT Road Geometrics file is loaded.</li>
          <li>County boundaries: US Census.</li>
        </ul>
      </section>
    </div>
  );
}

const recordLabel = (series: string) => `Crashes with ${series === "People" ? "person" : "vehicle"} records`;

function CoverageSection({ coverage, theme }: { coverage: Coverage; theme: ResolvedTheme }) {
  const { axis, grid, tip } = chartTheme(theme);
  const share = (n: number | null, d: number) => (n === null || !d ? null : +((100 * n) / d).toFixed(1));
  const rows = coverage.byYear.map((r) => ({
    year: r.year,
    Vehicles: share(r.crashesWithVehicles, r.crashes),
    People: share(r.crashesWithPeople, r.crashes),
  }));
  const hasPeople = rows.some((r) => r.People !== null);
  const fullFrom = coverage.byYear.find((_, i, a) => a.slice(i).every((x) => x.crashesWithVehicles === x.crashes))?.year;
  const tile = (value: number | null, label: string) => (
    <div>
      <strong>{value === null ? "pending" : fmt(value)}</strong>
      <span>{label}</span>
    </div>
  );
  return (
    <section className="overview-coverage">
      <h3 className="overview-h">What the data covers</h3>
      <p className="overview-coverage__lead">
        Not every crash report comes with its vehicle and person records, so some analyses only reach certain years.
        {fullFrom && <> Vehicle records cover every crash from {fullFrom} on.</>}
      </p>
      <div className="overview-stats overview-stats--compact">
        {tile(coverage.crashes, "CMV crashes")}
        {tile(coverage.vehicles, "vehicles on record")}
        {tile(coverage.people, "people on record")}
      </div>
      <div className="overview-coverage__chart">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
            <XAxis dataKey="year" stroke={axis} fontSize={11} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" stroke={axis} fontSize={11} />
            <Tooltip contentStyle={tip} formatter={(v, n) => [v === null ? "pending" : `${v}%`, recordLabel(String(n))]} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n) => recordLabel(String(n))} />
            <Bar dataKey="Vehicles" fill={theme === "dark" ? "#6b95ff" : "#1d4ed8"} radius={[3, 3, 0, 0]} />
            {hasPeople && <Bar dataKey="People" fill={theme === "dark" ? "#f5a55f" : "#d97706"} radius={[3, 3, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!coverage.complete && (
        <p className="overview-coverage__note">
          Vehicle and person counts are pending: run <code>data/prep_coverage.py</code> on the TITAN unit and person tables.
        </p>
      )}
    </section>
  );
}
