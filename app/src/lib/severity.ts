/**
 * Severity colors and ordering, shared by the map and the Mode 1 charts so the
 * same crash type is never two different colors in two places.
 *
 * Labels match the CrashTypeCde descriptions that data/prep_crash_data.py emits.
 */
export const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#b42318",
  "Injury - Incapacitating": "#e04f16",
  "Injury - Non-Incapacitating": "#f0883e",
  "Injury - Possible": "#f5b84f",
  "Property Damage": "#94a3b8",
  "Property Damage (Under Threshold)": "#cbd5e1",
  Unknown: "#c9ccd1",
};

/** Least severe first, so the worst crashes get drawn on top of the pile. */
const SEVERITY_ORDER = [
  "Property Damage (Under Threshold)",
  "Property Damage",
  "Unknown",
  "Injury - Possible",
  "Injury - Non-Incapacitating",
  "Injury - Incapacitating",
  "Fatal",
];

export function severityColor(label: string): string {
  return SEVERITY_COLORS[label] ?? "#999999";
}

export function severityRank(label: string): number {
  const i = SEVERITY_ORDER.indexOf(label);
  return i === -1 ? 0 : i;
}
