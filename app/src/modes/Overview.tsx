import { useMemo, useState } from "react";
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

const SECTIONS: { mode: DashboardMode; title: string; body: string; soon?: boolean }[] = [
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
    body: "Choose an interstate and follow its crashes mile by mile, end to end, with the busiest sections and metro areas marked.",
  },
  {
    mode: "fault",
    title: "At-Fault Analysis",
    body: "Who was at fault in two-vehicle truck crashes, by severity. In planning.",
    soon: true,
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

export default function Overview({ data, onOpen }: { data: CrashData | null; onOpen: (m: DashboardMode) => void }) {
  const { data: team } = useJson<{ members: TeamMember[] }>("team.json");

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
          collide, and which stretches of interstate see the most crashes.
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
          {SECTIONS.map((s) => (
            <button key={s.mode} type="button" className="overview-card" onClick={() => onOpen(s.mode)}>
              <span className="overview-card__title">
                {s.title}
                {s.soon && <span className="mode-tab__badge">soon</span>}
              </span>
              <span className="overview-card__body">{s.body}</span>
              <span className="overview-card__go">Open →</span>
            </button>
          ))}
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
