import type { ResolvedTheme } from "./theme";

/**
 * Severity colors, shared by the map canvas and the Mode 1 charts so the same
 * crash type is never two different colors in two places.
 *
 * There are two ramps because the light one does not survive a dark background:
 * the property-damage grays sit at the pale end and effectively disappear. The
 * dark ramp keeps the same hue progression (red through amber to gray) while
 * lifting lightness and dropping saturation so the colors read against #0b0d12
 * without glowing.
 *
 * Labels match the CrashTypeCde descriptions that data/prep_crash_data.py emits.
 */
const LIGHT: Record<string, string> = {
  Fatal: "#b42318",
  "Injury - Incapacitating": "#d64a1e",
  "Injury - Non-Incapacitating": "#ef8c3f",
  "Injury - Possible": "#f2b950",
  "Property Damage": "#94a3b8",
  "Property Damage (Under Threshold)": "#c3ccd8",
  Unknown: "#c9ccd1",
};

const DARK: Record<string, string> = {
  Fatal: "#f2645a",
  "Injury - Incapacitating": "#f5834f",
  "Injury - Non-Incapacitating": "#f5a55f",
  "Injury - Possible": "#e8c46a",
  "Property Damage": "#8794a8",
  "Property Damage (Under Threshold)": "#5d6878",
  Unknown: "#6f7784",
};

export function severityColors(theme: ResolvedTheme): Record<string, string> {
  return theme === "dark" ? DARK : LIGHT;
}

export function severityColor(label: string, theme: ResolvedTheme = "light"): string {
  return severityColors(theme)[label] ?? (theme === "dark" ? "#8a8f98" : "#999999");
}

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

export function severityRank(label: string): number {
  const i = SEVERITY_ORDER.indexOf(label);
  return i === -1 ? 0 : i;
}

/** Categorical ramp for non-severity breakdowns (route type, etc.). */
export function categoricalPalette(theme: ResolvedTheme): string[] {
  return theme === "dark"
    ? ["#6b95ff", "#5fc3b0", "#e8c46a", "#f5834f", "#b48bf0", "#7ec8e8", "#e88ba8", "#8794a8"]
    : ["#1d4ed8", "#0f9488", "#d99e2b", "#d64a1e", "#7c5cd6", "#2b8cb8", "#c2436b", "#64748b"];
}
