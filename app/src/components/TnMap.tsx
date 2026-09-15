import { useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, LayersControl } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useJson } from "../lib/useJson";
import "./TnMap.css";

const TN_CENTER: [number, number] = [35.86, -86.35];
const TN_ZOOM = 7;

interface HighwayProps {
  route_type: "Interstate" | "US / State Route" | "Major Highway";
  route_label: string;
  raw_number: string;
}

type HighwayFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, HighwayProps>;

const STYLE_BY_TYPE: Record<string, PathOptions> = {
  Interstate: { color: "#C2410C", weight: 3, opacity: 0.9 },
  "US / State Route": { color: "#6B7280", weight: 1.4, opacity: 0.75 },
  "Major Highway": { color: "#C2410C", weight: 2.5, opacity: 0.85 },
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

export default function TnMap() {
  const { data: highways, loading, error } = useJson<HighwayFeatureCollection>(
    "tn_highways.geojson"
  );

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

  const [showNotice] = useState(true);

  return (
    <div className="tn-map-wrap">
      {showNotice && (
        <div className="tn-map-notice">
          Highway lines are a placeholder (public roads data) until the real TDOT Road
          Geometrics shapefile is loaded.
        </div>
      )}
      <MapContainer center={TN_CENTER} zoom={TN_ZOOM} className="tn-map" scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
      </MapContainer>
      {loading && <div className="tn-map-status">Loading highways…</div>}
      {error && <div className="tn-map-status tn-map-status--error">Couldn't load highway data: {error}</div>}
    </div>
  );
}
