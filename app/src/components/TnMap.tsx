import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, LayersControl, Pane, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useJson } from "../lib/useJson";
import type { CrashData } from "../lib/crashes";
import { fmt } from "../lib/crashes";
import type { ResolvedTheme } from "../lib/theme";
import { severityColor, severityRank } from "../lib/severity";
import CrashLayer from "./CrashLayer";
import "./TnMap.css";

// Fit to Tennessee rather than centering on it, so the state fills the panel
// instead of leaving a third of the frame on Kentucky and Alabama. TN is a wide,
// short state and the map panel is tall and narrow, so the fit has to come from
// fractional zoom (zoomSnap below); at Leaflet's default whole-number snapping
// this rounds down a full level and the state ends up small in the frame.
const TN_BOUNDS: [[number, number], [number, number]] = [
  [34.98, -90.31],
  [36.68, -81.65],
];

interface HighwayProps {
  route_type: "Interstate" | "US / State Route" | "Major Highway";
  route_label: string;
  raw_number: string;
}

type HighwayFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, HighwayProps>;
type CountyFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, { county: string }>;

// Both road classes are the same blue; interstates read as primary purely by
// being thicker and more opaque than the US / state routes underneath them.
// The dark basemap needs a lighter blue to hold the same contrast ratio.
const ROAD_BLUE: Record<ResolvedTheme, string> = {
  light: "#1d4ed8",
  dark: "#6b95ff",
};

// Corridor highlight: amber reads against both the blue network and the grey basemap.
const HIGHLIGHT: Record<ResolvedTheme, string> = {
  light: "#d97706",
  dark: "#fbbf24",
};

function stylesFor(theme: ResolvedTheme, dimmed: boolean): Record<string, PathOptions> {
  const color = ROAD_BLUE[theme];
  const k = dimmed ? 0.45 : 1;
  return {
    Interstate: { color, weight: 3.6, opacity: 0.95 * k },
    "US / State Route": { color, weight: 1.5, opacity: (theme === "dark" ? 0.7 : 0.6) * k },
    "Major Highway": { color, weight: 3, opacity: 0.9 * k },
  };
}

// Standard OpenStreetMap tiles, which need no API key. Carto's dark_all basemap
// would be the nicer starting point, but it now watermarks every tile with
// "API KEY REQUIRED" for unregistered use, so it is not usable here.
//
// The tiles are greyed with a CSS filter over the tile pane (see TnMap.css), and
// dark mode inverts them there too. The filter is scoped to .leaflet-tile-pane
// so the crash canvas and the road overlay keep their real colors.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Zooms to whatever is in focus: a county, else a selected route, else the
 * whole state. Runs only when the focus changes, so it never fights the user's
 * own panning.
 */
function FocusView({ focusKey, bounds }: { focusKey: string; bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  const last = useRef(focusKey);
  useEffect(() => {
    if (last.current === focusKey) return;
    last.current = focusKey;
    map.flyToBounds(bounds, { padding: [24, 24], duration: 0.6, maxZoom: 10 });
  }, [map, focusKey, bounds]);
  return null;
}

export interface TnMapProps {
  data: CrashData | null;
  /** Crash rows to draw (already filtered). */
  rows: number[];
  theme: ResolvedTheme;
  /** Hide crash points and show only the highway network (corridor mode). */
  networkOnly?: boolean;
  severityOff: string[];
  onToggleSeverity: (label: string) => void;
  county: string | null;
  onCountyChange: (county: string | null) => void;
  /** Corridor mode: the selected route's line, drawn on top in amber. */
  highlight?: { id: string; path: [number, number][] } | null;
  onRouteClick?: (routeLabel: string) => void;
  /** Replaces the severity legend and coloring, e.g. fault outcome on the At-Fault tab. */
  colorBy?: {
    title: string;
    items: { key: string; color: string; off: boolean }[];
    onToggle: (key: string) => void;
    colorFor: (i: number) => string;
    rankFor: (i: number) => number;
    popupExtra: (i: number) => string;
  };
}

export default function TnMap({
  data,
  rows,
  theme,
  networkOnly = false,
  severityOff,
  onToggleSeverity,
  county,
  onCountyChange,
  highlight,
  onRouteClick,
  colorBy,
}: TnMapProps) {
  const dimRoads = !!highlight;
  const styleFor = useMemo(() => {
    const table = stylesFor(theme, dimRoads);
    return (feature?: GeoJSON.Feature<GeoJSON.Geometry, HighwayProps>): PathOptions => {
      const type = feature?.properties?.route_type ?? "US / State Route";
      return table[type] ?? table["US / State Route"];
    };
  }, [theme, dimRoads]);

  const { data: highways, loading, error } = useJson<HighwayFeatureCollection>("tn_highways.geojson");
  const { data: counties } = useJson<CountyFeatureCollection>("tn_counties.geojson");
  const { data: mask } = useJson<GeoJSON.FeatureCollection>("tn_mask.geojson");

  const interstates = useMemo(() => {
    if (!highways) return null;
    return {
      ...highways,
      features: highways.features.filter(
        (f) => f.properties.route_type === "Interstate" || f.properties.route_type === "Major Highway"
      ),
    };
  }, [highways]);

  const stateRoutes = useMemo(() => {
    if (!highways) return null;
    return {
      ...highways,
      features: highways.features.filter((f) => f.properties.route_type === "US / State Route"),
    };
  }, [highways]);

  // Severity legend entries, most severe first so the list reads top-down.
  const severityKeys = useMemo(() => {
    if (!data) return [];
    return [...data.keys.severity].sort((a, b) => severityRank(b) - severityRank(a));
  }, [data]);

  const [showCrashes, setShowCrashes] = useState(true);
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [counts, setCounts] = useState({ rendered: 0, inView: 0, matching: 0, thinned: false });

  const handleRenderedChange = useCallback(
    (next: { rendered: number; inView: number; matching: number; thinned: boolean }) => {
      setCounts((prev) =>
        prev.rendered === next.rendered &&
        prev.inView === next.inView &&
        prev.matching === next.matching &&
        prev.thinned === next.thinned
          ? prev
          : next
      );
    },
    []
  );

  const onEachHighway = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Geometry, HighwayProps>, layer: Layer) => {
      const { route_label, route_type } = feature.properties;
      layer.bindTooltip(`${route_label} (${route_type})`, { sticky: true });
      if (onRouteClick && route_type === "Interstate") {
        layer.on("click", () => onRouteClick(route_label));
      }
    },
    [onRouteClick]
  );

  const countyStyle = useCallback(
    (feature?: GeoJSON.Feature<GeoJSON.Geometry, { county: string }>): PathOptions => {
      const selected = feature?.properties.county === county;
      const line = theme === "dark" ? "#9aa4b4" : "#667085";
      return selected
        ? { color: ROAD_BLUE[theme], weight: 2.5, opacity: 1, fillColor: ROAD_BLUE[theme], fillOpacity: 0.08 }
        : { color: line, weight: 0.6, opacity: 0.55, fillOpacity: 0 };
    },
    [county, theme]
  );

  const onEachCounty = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Geometry, { county: string }>, layer: Layer) => {
      const name = feature.properties.county;
      layer.bindTooltip(`${name} County · click to focus`, { sticky: true });
      layer.on("click", (e: LeafletMouseEvent) => {
        e.originalEvent.stopPropagation();
        onCountyChange(name === county ? null : name);
      });
    },
    [county, onCountyChange]
  );

  const maskStyle: PathOptions = {
    stroke: false,
    fillColor: theme === "dark" ? "#05070a" : "#98a2b3",
    fillOpacity: theme === "dark" ? 0.7 : 0.55,
    interactive: false,
  };

  const focus = useMemo((): { key: string; bounds: L.LatLngBoundsExpression } => {
    if (county && counties) {
      const f = counties.features.find((c) => c.properties.county === county);
      if (f) return { key: `county:${county}`, bounds: L.geoJSON(f).getBounds() };
    }
    if (highlight) return { key: `route:${highlight.id}`, bounds: L.latLngBounds(highlight.path) };
    return { key: "state", bounds: TN_BOUNDS };
  }, [county, counties, highlight]);

  return (
    <div className="tn-map-wrap">
      {noticeOpen && (
        <div className="tn-map-notice">
          <span>
            Highway lines are a placeholder (public roads data) until the real TDOT Road Geometrics shapefile is
            loaded.
          </span>
          <button
            type="button"
            className="tn-map-notice__close"
            onClick={() => setNoticeOpen(false)}
            aria-label="Dismiss notice"
          >
            &times;
          </button>
        </div>
      )}

      <MapContainer
        bounds={TN_BOUNDS}
        boundsOptions={{ padding: [8, 8] }}
        zoomSnap={0.25}
        zoomDelta={0.5}
        className="tn-map"
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={TILE_URL}
        />

        {/* Everything outside Tennessee sits under a grey veil. */}
        <Pane name="mask" style={{ zIndex: 350 }}>
          {mask && <GeoJSON key={`mask-${theme}`} data={mask} style={maskStyle} />}
        </Pane>

        <LayersControl position="topright">
          {counties && (
            <LayersControl.Overlay checked name="Counties">
              <GeoJSON
                key={`c-${theme}-${county ?? "all"}`}
                data={counties}
                style={countyStyle}
                onEachFeature={onEachCounty}
              />
            </LayersControl.Overlay>
          )}

          {stateRoutes && (
            <LayersControl.Overlay checked name="US / State Routes">
              <GeoJSON key={`sr-${theme}-${dimRoads}`} data={stateRoutes} style={styleFor} onEachFeature={onEachHighway} />
            </LayersControl.Overlay>
          )}

          {interstates && (
            <LayersControl.Overlay checked name="Interstates">
              <GeoJSON
                key={`i-${theme}-${dimRoads}-${!!onRouteClick}`}
                data={interstates}
                style={styleFor}
                onEachFeature={onEachHighway}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        <FocusView focusKey={focus.key} bounds={focus.bounds} />

        {highlight && (
          <>
            <Polyline
              key={`halo-${highlight.id}-${theme}`}
              positions={highlight.path}
              pathOptions={{ color: theme === "dark" ? "#0b0d12" : "#ffffff", weight: 10, opacity: 0.9 }}
            />
            <Polyline
              key={`hl-${highlight.id}-${theme}`}
              positions={highlight.path}
              pathOptions={{ color: HIGHLIGHT[theme], weight: 6, opacity: 1 }}
            />
          </>
        )}

        {data && showCrashes && (!networkOnly || highlight) && (
          <CrashLayer
            data={data}
            rows={rows}
            theme={theme}
            colorFor={colorBy?.colorFor}
            rankFor={colorBy?.rankFor}
            popupExtra={colorBy?.popupExtra}
            onRenderedChange={handleRenderedChange}
          />
        )}
      </MapContainer>

      <div className="tn-map-legend">
        <label className="tn-map-legend__head">
          <input type="checkbox" checked={showCrashes} onChange={(e) => setShowCrashes(e.target.checked)} />
          <span>{colorBy ? colorBy.title : networkOnly ? "Crashes on the selected route" : "Crash points"}</span>
        </label>

        {showCrashes && (
          <>
            <ul className="tn-map-legend__list">
              {colorBy
                ? colorBy.items.map((it) => (
                    <li key={it.key}>
                      <label className={it.off ? "is-off" : undefined}>
                        <input type="checkbox" checked={!it.off} onChange={() => colorBy.onToggle(it.key)} />
                        <span className="swatch" style={{ background: it.color }} />
                        <span className="swatch-label">{it.key}</span>
                      </label>
                    </li>
                  ))
                : severityKeys.map((key) => {
                const off = severityOff.includes(key);
                return (
                  <li key={key}>
                    <label className={off ? "is-off" : undefined}>
                      <input type="checkbox" checked={!off} onChange={() => onToggleSeverity(key)} />
                      <span className="swatch" style={{ background: severityColor(key, theme) }} />
                      <span className="swatch-label">{key}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="tn-map-legend__count">
              {!data
                ? "Loading crashes…"
                : networkOnly && !highlight
                  ? "Pick an interstate to see its crashes."
                  : counts.thinned
                    ? `Showing ${fmt(counts.rendered)} of ${fmt(counts.inView)} crashes in view. Zoom in to see them all. ${fmt(counts.matching)} match the filters.`
                    : `Showing all ${fmt(counts.rendered)} crashes in view. ${fmt(counts.matching)} match the filters.`}
            </p>
          </>
        )}

        <div className="tn-map-legend__county">
          <span>{county ? `Focused: ${county} County` : "Click a county to focus"}</span>
          {county && (
            <button type="button" onClick={() => onCountyChange(null)}>
              Clear
            </button>
          )}
        </div>

        <div className="tn-map-legend__roads">
          <span className="road-key road-key--interstate" /> Interstate
          <span className="road-key road-key--route" /> US / State Route
        </div>
      </div>

      {loading && <div className="tn-map-status">Loading highways…</div>}
      {error && <div className="tn-map-status tn-map-status--error">Couldn't load highway data: {error}</div>}
    </div>
  );
}
