import type { ThemeChoice } from "../lib/theme";
import "./ThemeToggle.css";

const OPTIONS: { id: ThemeChoice; label: string; title: string }[] = [
  { id: "light", label: "Light", title: "Always light" },
  { id: "dark", label: "Dark", title: "Always dark" },
  { id: "system", label: "Auto", title: "Follow the system setting" },
];

function Icon({ id }: { id: ThemeChoice }) {
  if (id === "light") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1" />
      </svg>
    );
  }
  if (id === "dark") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.4" />
      <path d="M5.5 13.8h5" />
    </svg>
  );
}

export default function ThemeToggle({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (c: ThemeChoice) => void;
}) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          aria-pressed={choice === o.id}
          className={`theme-toggle__btn${choice === o.id ? " is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          <Icon id={o.id} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
