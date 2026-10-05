import type { ReactNode } from "react";
import type { TnMapProps } from "../components/TnMap";
import type { CrashData, Filters } from "./crashes";
import type { ResolvedTheme } from "./theme";

/** Map props a mode may override; App supplies the rest (filters, county focus, legend toggles). */
export type MapOverrides = Partial<Pick<TnMapProps, "rows" | "networkOnly" | "highlight" | "onRouteClick" | "colorBy">>;
export type RenderMap = (overrides?: MapOverrides) => ReactNode;

/** What App hands every map tab. */
export interface ModeProps {
  data: CrashData;
  /** Crash rows that pass the shared filters. */
  rows: number[];
  filters: Filters;
  onChange: (f: Filters) => void;
  theme: ResolvedTheme;
  renderMap: RenderMap;
}
