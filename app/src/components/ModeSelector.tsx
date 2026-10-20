import type { DashboardMode } from "../lib/types";
import "./ModeSelector.css";

const MODES: { id: DashboardMode; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "explore", label: "Exploratory Analysis" },
  { id: "manner", label: "Manner of Collision" },
  { id: "corridor", label: "Corridor Analysis" },
  { id: "factors", label: "Contributing Factors" },
];

/** Tab pills across the header, like the UConn dashboard's emphasis-area menu. */
export default function ModeSelector({
  mode,
  onChange,
  tabs,
}: {
  mode: DashboardMode;
  onChange: (m: DashboardMode) => void;
  /** Tabs to show (presentation mode hides some, see src/config.ts). */
  tabs: DashboardMode[];
}) {
  return (
    <nav className="mode-selector" aria-label="Dashboard tabs">
      {MODES.filter((m) => tabs.includes(m.id)).map((m) => (
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
