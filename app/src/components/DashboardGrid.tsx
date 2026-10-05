import type { ReactNode } from "react";
import { Panel } from "./Widgets";
import "./DashboardGrid.css";

/**
 * The page frame every map tab shares, laid out like the UConn CT Crash FMCSA
 * dashboard:
 *
 *   ┌────────┬──────────────┬──────────────────┐
 *   │        │ Map | About  │ side panels      │
 *   │ count  │              │ (stacked)        │
 *   │ tiles, ├──────────────┴──────────────────┤
 *   │ gauges │ bottom panels (side by side)    │
 *   └────────┴─────────────────────────────────┘
 *
 * It fills the window on wide screens (panels scroll inside themselves) and
 * stacks into one scrolling column on narrow ones.
 */
interface DashboardGridProps {
  kpis: ReactNode;
  map: ReactNode;
  /** Text for the map panel's "About" tab. */
  about: ReactNode;
  /** Shown above the map, e.g. the active date range. */
  mapCaption?: ReactNode;
  side: ReactNode;
  bottom: ReactNode;
}

export default function DashboardGrid({ kpis, map, about, mapCaption, side, bottom }: DashboardGridProps) {
  return (
    <div className="dash-grid">
      <div className="dash-grid__kpis">{kpis}</div>
      <Panel
        className="dash-grid__map"
        tabs={[
          {
            label: "Map",
            content: (
              <div className="dash-map">
                {mapCaption && <div className="dash-map__caption">{mapCaption}</div>}
                <div className="dash-map__frame">{map}</div>
              </div>
            ),
          },
          { label: "About this view", content: <div className="dash-about">{about}</div> },
        ]}
      />
      <div className="dash-grid__side">{side}</div>
      <div className="dash-grid__bottom">{bottom}</div>
    </div>
  );
}
