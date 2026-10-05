import type { CSSProperties } from "react";
import type { ResolvedTheme } from "./theme";

/** Recharts needs literal colors, so the CSS tokens are mirrored here. */
export function chartTheme(theme: ResolvedTheme): { axis: string; grid: string; text: string; tip: CSSProperties } {
  const dark = theme === "dark";
  return {
    axis: dark ? "#9aa4b4" : "#667085",
    grid: dark ? "#212734" : "#eceff3",
    text: dark ? "#e7eaf0" : "#101828",
    tip: {
      background: dark ? "#171b23" : "#ffffff",
      border: `1px solid ${dark ? "#242a35" : "#e4e7ec"}`,
      borderRadius: 8,
      color: dark ? "#e7eaf0" : "#101828",
      fontSize: 12,
      boxShadow: dark ? "0 4px 14px -2px rgb(0 0 0 / 0.5)" : "0 4px 12px -2px rgb(16 24 40 / 0.1)",
    },
  };
}
