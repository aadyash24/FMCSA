import type { YearRange as Range } from "../lib/types";
import "./YearRange.css";

/**
 * Always-visible year range in the header. The old filter bar had one; the
 * slide-out panel moved it out of sight, so tabs showed a range you couldn't
 * change from where you were looking. Same state as the panel's Date range.
 */
export default function YearRange({
  years,
  value,
  fullRange,
  onChange,
}: {
  years: string[];
  value: Range;
  fullRange: Range;
  onChange: (r: Range) => void;
}) {
  const [from, to] = value;
  const narrowed = from !== fullRange[0] || to !== fullRange[1];
  return (
    <div className={`year-range${narrowed ? " is-narrowed" : ""}`} role="group" aria-label="Years">
      <span className="year-range__label">Years</span>
      <select value={from} onChange={(e) => onChange([e.target.value, to])} aria-label="From year">
        {years.map((y) => (
          <option key={y} value={y} disabled={y > to}>
            {y}
          </option>
        ))}
      </select>
      <span className="year-range__dash">–</span>
      <select value={to} onChange={(e) => onChange([from, e.target.value])} aria-label="To year">
        {years.map((y) => (
          <option key={y} value={y} disabled={y < from}>
            {y}
          </option>
        ))}
      </select>
      {narrowed && (
        <button type="button" className="year-range__reset" onClick={() => onChange(fullRange)} aria-label="All years">
          &times;
        </button>
      )}
    </div>
  );
}
