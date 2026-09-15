import type { DashboardMode } from "../lib/types";
import "./ModeSelector.css";

const MODES: { id: DashboardMode; label: string; soon?: boolean }[] = [
  { id: "explore", label: "Mode 1 · Data Exploration" },
  { id: "risk", label: "Mode 2 · Risk Assessment", soon: true },
  { id: "predict", label: "Mode 3 · Predictive Modeling", soon: true },
];

export default function ModeSelector({
  mode,
  onChange,
}: {
  mode: DashboardMode;
  onChange: (m: DashboardMode) => void;
}) {
  return (
    <nav className="mode-selector" aria-label="Dashboard mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`mode-tab${mode === m.id ? " mode-tab--active" : ""}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
          {m.soon && <span className="mode-tab__badge">soon</span>}
        </button>
      ))}
    </nav>
  );
}
