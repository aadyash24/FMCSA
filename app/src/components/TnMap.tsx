import { useCallback, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, LayersControl } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useJson } from "../lib/useJson";
import type { CrashPoints, YearRange } from "../lib/types";
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

// Both road classes are the same blue; interstates read as primary purely by
// being thicker and more opaque than the US / state routes underneath them.
const ROAD_BLUE = "#1d4ed8";

const STYLE_BY_TYPE: Record<string, PathOptions> = {
  Interstate: { color: ROAD_BLUE, weight: 3.6, opacity: 0.95 },
  "US / State Route": { color: ROAD_BLUE, weight: 1.5, opacity: 0.6 },
  "Major Highway": { color: ROAD_BLUE, weight: 3, opacity: 0.9 },
};

function styleFor(feature?: GeoJSON.Feature<GeoJSON.Geometry, HighwayProps>): PathOptions {
  const type = feature?.properties?.route_type ?? "US / State Route";
  return STYLE_BY_TYPE[type] ?? STYLE_BY_TYPE["US / State Route"];
}

function onEachHighway(
  feature: GeoJSON.Feature<GeoJSON.Geometry, HighwayProps>,
  layer: Layer
) {
  const { route_label, route_type } = feature.properties;
  layer.bindTooltip(`${route_label} (${route_type})`, { sticky: true });
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

interface TnMapProps {
  yearRange: YearRange;
}

export default function TnMap({ yearRange }: TnMapProps) {
  const { data: highways, loading, error } = useJson<HighwayFeatureCollection>(
    "tn_highways.geojson"
  );
  const { data: crashes, loading: crashesLoading } = useJson<CrashPoints>("points.json");

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
    if (!crashes) return [];
    return [...crashes.keys].sort((a, b) => severityRank(b) - severityRank(a));
  }, [crashes]);

  const [showCrashes, setShowCrashes] = useState(true);
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [counts, setCounts] = useState({
    rendered: 0,
    inView: 0,
    matching: 0,
    thinned: false,
  });

  const enabled = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const k of severityKeys) out[k] = !disabled[k];
    return out;
  }, [severityKeys, disabled]);

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

  const toggleSeverity = (key: string) =>
    setDisabled((d) => ({ ...d, [key]: !d[key] }));


  return (
    <div className="tn-map-wrap">
      {noticeOpen && (
        <div className="tn-map-notice">
          <span>
            Highway lines are a placeholder (public roads data) until the real TDOT Road
            Geometrics shapefile is loaded.
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
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Carto Light">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
          </LayersControl.BaseLayer>

          {stateRoutes && (
            <LayersControl.Overlay checked name="US / State Routes">
              <GeoJSON data={stateRoutes} style={styleFor} onEachFeature={onEachHighway} />
            </LayersControl.Overlay>
          )}

          {interstates && (
            <LayersControl.Overlay checked name="Interstates">
              <GeoJSON data={interstates} style={styleFor} onEachFeature={onEachHighway} />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        {crashes && showCrashes && (
          <CrashLayer
            points={crashes.points}
            keys={crashes.keys}
            yearRange={yearRange}
            enabled={enabled}
            onRenderedChange={handleRenderedChange}
          />
        )}
      </MapContainer>

      <div className="tn-map-legend">
        <label className="tn-map-legend__head">
          <input
            type="checkbox"
            checked={showCrashes}
            onChange={(e) => setShowCrashes(e.target.checked)}
          />
          <span>Crash points</span>
        </label>

        {showCrashes && (
          <>
            <ul className="tn-map-legend__list">
              {severityKeys.map((key) => (
                <li key={key}>
                  <label className={disabled[key] ? "is-off" : undefined}>
                    <input
                      type="checkbox"
                      checked={!disabled[key]}
                      onChange={() => toggleSeverity(key)}
                    />
                    <span className="swatch" style={{ background: severityColor(key) }} />
                    <span className="swatch-label">{key}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="tn-map-legend__count">
              {crashesLoading
                ? "Loading crashes…"
                : counts.thinned
                  ? `Showing ${fmt(counts.rendered)} of ${fmt(counts.inView)} crashes in view. Zoom in to see them all. ${fmt(counts.matching)} match the filters statewide.`
                  : `Showing all ${fmt(counts.rendered)} crashes in view. ${fmt(counts.matching)} match the filters statewide.`}
            </p>
          </>
        )}

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
