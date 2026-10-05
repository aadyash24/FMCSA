import { useEffect, useMemo, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { CrashData } from "../lib/crashes";
import type { ResolvedTheme } from "../lib/theme";
import { severityColor, severityRank } from "../lib/severity";

/**
 * Renders the crash points on a single Leaflet canvas.
 *
 * There are ~45k crashes in the extract, which is far more than Leaflet will
 * draw as individual SVG markers without the map turning to glue. Two things
 * keep it responsive:
 *   1. every marker shares one L.canvas() renderer, so panning repaints one
 *      canvas rather than touching 45k DOM nodes;
 *   2. only points inside the padded viewport are built, and when that is still
 *      too many (statewide zoom) they are thinned by a fixed stride.
 *
 * The stride is deterministic, so the thinned view does not shimmer as you pan.
 * The point count is reported upward so the legend can say what is being shown.
 *
 * Filtering happens upstream (lib/crashes.ts): this layer draws exactly the
 * crash rows it is handed, so the map always matches the charts.
 */

const MAX_RENDERED = 9000;

function radiusForZoom(zoom: number): number {
  if (zoom <= 7) return 2.5;
  if (zoom <= 9) return 3.5;
  if (zoom <= 11) return 4.5;
  return 5.5;
}

interface CrashLayerProps {
  data: CrashData;
  /** Row indexes of the crashes to draw. */
  rows: number[];
  theme: ResolvedTheme;
  /** Point color per crash row; defaults to severity. */
  colorFor?: (i: number) => string;
  /** Draw order per crash row, higher on top; defaults to severity rank. */
  rankFor?: (i: number) => number;
  /** Extra popup line per crash row. */
  popupExtra?: (i: number) => string;
  onRenderedChange?: (stats: {
    rendered: number;
    inView: number;
    matching: number;
    thinned: boolean;
  }) => void;
}

export default function CrashLayer({ data, rows, theme, colorFor, rankFor, popupExtra, onRenderedChange }: CrashLayerProps) {
  const map = useMap();
  const rendererRef = useRef<L.Canvas | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const [viewVersion, setViewVersion] = useState(0);

  useMapEvents({
    moveend: () => setViewVersion((v) => v + 1),
    zoomend: () => setViewVersion((v) => v + 1),
  });

  // One canvas + one layer group for the life of the map.
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.3 });
    const group = L.layerGroup([], { pane: "overlayPane" });
    rendererRef.current = renderer;
    groupRef.current = group;
    group.addTo(map);
    return () => {
      group.remove();
      rendererRef.current = null;
      groupRef.current = null;
    };
  }, [map]);

  // Drop rows without coordinates, then draw least severe first so fatal
  // crashes land on top of the canvas stack. Independent of panning.
  const eligible = useMemo(() => {
    const { lat, severity } = data.cols;
    const rank = data.keys.severity.map(severityRank);
    const order = rankFor ?? ((i: number) => rank[severity[i]]);
    return rows.filter((i) => lat[i] !== null).sort((a, b) => order(a) - order(b));
  }, [data, rows, rankFor]);

  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;

    const bounds = map.getBounds().pad(0.25);
    const zoom = map.getZoom();
    const radius = radiusForZoom(zoom);

    const { lat: lats, lon: lons, year: years, severity, manner } = data.cols;
    const inView: number[] = [];
    for (const i of eligible) {
      if (bounds.contains([lats[i] as number, lons[i] as number])) inView.push(i);
    }

    const stride = inView.length > MAX_RENDERED ? Math.ceil(inView.length / MAX_RENDERED) : 1;

    group.clearLayers();
    for (let k = 0; k < inView.length; k += stride) {
      const i = inView[k];
      const lat = lats[i] as number;
      const lon = lons[i] as number;
      const label = data.keys.severity[severity[i]];
      const marker = L.circleMarker([lat, lon], {
        renderer,
        radius,
        stroke: false,
        fillColor: colorFor ? colorFor(i) : severityColor(label, theme),
        fillOpacity: theme === "dark" ? 0.8 : 0.72,
      });
      marker.bindPopup(
        `<strong>${label}</strong><br/>${years[i]} · ${data.keys.manner[manner[i]]}<br/>${
          data.keys.county[data.cols.county[i]]
        } County${popupExtra ? `<br/>${popupExtra(i)}` : ""}<br/><span style="color:#666">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>`
      );
      group.addLayer(marker);
    }

    const rendered = stride === 1 ? inView.length : Math.ceil(inView.length / stride);
    // "thinned" is about the stride, not about rendered < matching. Zoomed in,
    // rendered is legitimately far below matching because most crashes are off
    // screen, and saying "zoom in for the rest" there would be wrong.
    onRenderedChange?.({
      rendered,
      inView: inView.length,
      matching: eligible.length,
      thinned: stride > 1,
    });
  }, [eligible, data, map, viewVersion, theme, colorFor, popupExtra, onRenderedChange]);

  return null;
}
