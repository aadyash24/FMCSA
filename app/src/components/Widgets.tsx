import { useState } from "react";
import type { ReactNode } from "react";
import "./Widgets.css";

/**
 * Building blocks for the dashboard frame, modeled on the UConn CT Crash FMCSA
 * dashboard (ArcGIS Dashboards): titled panels that can hold several tabs,
 * big-number indicator tiles, and half-circle gauges.
 */

export interface PanelTab {
  label: string;
  content: ReactNode;
}

interface PanelProps {
  title?: ReactNode;
  note?: ReactNode;
  /** When given, the panel shows tab buttons and one tab's content at a time. */
  tabs?: PanelTab[];
  /** Controls next to the title (toggles, bin sizes...). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Panel({ title, note, tabs, actions, children, className }: PanelProps) {
  const [active, setActive] = useState(0);
  const tab = tabs ? tabs[Math.min(active, tabs.length - 1)] : null;
  return (
    <section className={`dash-panel${className ? ` ${className}` : ""}`}>
      {(title || tabs || actions) && (
        <header className="dash-panel__head">
          {title && <h3 className="dash-panel__title">{title}</h3>}
          {tabs && (
            <div className="dash-panel__tabs" role="tablist">
              {tabs.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  role="tab"
                  aria-selected={t === tab}
                  className={`dash-panel__tab${t === tab ? " is-active" : ""}`}
                  onClick={() => setActive(i)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {actions && <div className="dash-panel__actions">{actions}</div>}
        </header>
      )}
      {note && <p className="dash-panel__note">{note}</p>}
      <div className="dash-panel__body">{tab ? tab.content : children}</div>
    </section>
  );
}

interface IndicatorProps {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Accent color for the number; defaults to the theme accent. */
  color?: string;
  size?: "lg" | "md";
}

/** Big-number tile, like the UConn "FMCSA Crashes" / "Work Zone" indicators. */
export function Indicator({ label, value, sub, color, size = "md" }: IndicatorProps) {
  return (
    <div className={`indicator indicator--${size}`}>
      <div className="indicator__label">{label}</div>
      <div className="indicator__value tnum" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="indicator__sub">{sub}</div>}
    </div>
  );
}

interface GaugeProps {
  label: string;
  /** 0..1 */
  share: number;
  /** Text under the arc, e.g. "312 of 45,650". */
  detail: string;
  color: string;
  /** Gauge maximum as a share, so small percentages still move the needle. */
  max?: number;
}

/** Half-circle gauge for "share of crashes that were fatal / serious injury". */
export function Gauge({ label, share, detail, color, max = 1 }: GaugeProps) {
  const r = 46;
  const arc = Math.PI * r;
  const frac = Math.max(0, Math.min(1, share / max));
  return (
    <div className="gauge">
      <div className="gauge__label">{label}</div>
      <svg viewBox="0 0 120 70" className="gauge__svg" aria-hidden="true">
        <path d="M14 62 A46 46 0 0 1 106 62" className="gauge__track" />
        <path
          d="M14 62 A46 46 0 0 1 106 62"
          className="gauge__fill"
          style={{ stroke: color, strokeDasharray: `${arc * frac} ${arc}` }}
        />
        <text x="60" y="58" textAnchor="middle" className="gauge__pct">
          {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
        </text>
      </svg>
      <div className="gauge__detail tnum">{detail}</div>
      {max < 1 && <div className="gauge__scale">scale 0–{Math.round(max * 100)}%</div>}
    </div>
  );
}

/** Short explanatory text block inside a panel. */
export function Callout({ children }: { children: ReactNode }) {
  return <div className="dash-callout">{children}</div>;
}
