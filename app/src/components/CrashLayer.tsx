import { useEffect, useMemo, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { CrashPoint, YearRange } from "../lib/types";
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
 */

const MAX_RENDERED = 9000;

function radiusForZoom(zoom: number): number {
  if (zoom <= 7) return 2.5;
  if (zoom <= 9) return 3.5;
  if (zoom <= 11) return 4.5;
  return 5.5;
}

interface CrashLayerProps {
  points: CrashPoint[];
  keys: string[];
  yearRange: YearRange;
  enabled: Record<string, boolean>;
  onRenderedChange?: (stats: {
    rendered: number;
    inView: number;
    matching: number;
    thinned: boolean;
  }) => void;
}

export default function CrashLayer({
  points,
  keys,
  yearRange,
  enabled,
  onRenderedChange,
}: CrashLayerProps) {
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

  // Year + severity filtering is independent of panning, so it is memoized
  // separately from the per-viewport rebuild below.
  const eligible = useMemo(() => {
    const [from, to] = [Number(yearRange[0]), Number(yearRange[1])];
    const kept = points.filter((p) => {
      if (p[2] < from || p[2] > to) return false;
      return enabled[keys[p[3]]] !== false;
    });
    // Least severe first so fatal crashes land on top of the canvas stack.
    return kept.sort((a, b) => severityRank(keys[a[3]]) - severityRank(keys[b[3]]));
  }, [points, keys, yearRange, enabled]);

  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;

    const bounds = map.getBounds().pad(0.25);
    const zoom = map.getZoom();
    const radius = radiusForZoom(zoom);

    const inView: CrashPoint[] = [];
    for (const p of eligible) {
      if (bounds.contains([p[0], p[1]])) inView.push(p);
    }

    const stride = inView.length > MAX_RENDERED ? Math.ceil(inView.length / MAX_RENDERED) : 1;

    group.clearLayers();
    for (let i = 0; i < inView.length; i += stride) {
      const [lat, lon, year, sevIdx] = inView[i];
      const label = keys[sevIdx];
      const marker = L.circleMarker([lat, lon], {
        renderer,
        radius,
        stroke: false,
        fillColor: severityColor(label),
        fillOpacity: 0.72,
      });
      marker.bindPopup(
        `<strong>${label}</strong><br/>${year}<br/><span style="color:#666">${lat.toFixed(
          4
        )}, ${lon.toFixed(4)}</span>`
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
  }, [eligible, keys, map, viewVersion, onRenderedChange]);

  return null;
}
