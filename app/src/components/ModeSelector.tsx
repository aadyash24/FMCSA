import type { DashboardMode } from "../lib/types";
import "./ModeSelector.css";

const MODES: { id: DashboardMode; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "explore", label: "Exploratory Analysis" },
  { id: "manner", label: "Manner of Collision" },
  { id: "corridor", label: "Corridor Analysis" },
  { id: "fault", label: "At-Fault Analysis" },
];

/** Tab pills across the header, like the UConn dashboard's emphasis-area menu. */
export default function ModeSelector({
  mode,
  onChange,
}: {
  mode: DashboardMode;
  onChange: (m: DashboardMode) => void;
}) {
  return (
    <nav className="mode-selector" aria-label="Dashboard tabs">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`mode-tab${mode === m.id ? " mode-tab--active" : ""}`}
          aria-current={mode === m.id ? "page" : undefined}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}
