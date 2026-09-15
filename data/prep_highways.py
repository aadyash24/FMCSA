"""
Builds a placeholder TN interstate / highway GeoJSON layer for the dashboard
skeleton, since the real TDOT Road_Geometrics shapefile (only its metadata
.shp.xml/.cpg/.prj was in the project, not the .shp/.dbf/.shx geometry) is
not available yet.

Source: Natural Earth 1:10m Roads (public domain), clipped to the Tennessee
state polygon. This is coarse compared to the real TDOT data Chris's R
script reads (209,126 road segments) -- swap this out once the actual
Road_Geometrics shapefile is available, using the same R script in
"Highway Extraction in R.txt" to export a GeoJSON instead of a Leaflet widget.

Run from the repo root:
    python3 data/prep_highways.py
"""

import json
import os

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

BASE = os.path.dirname(__file__)
ROADS_GEOJSON = os.path.join(BASE, "raw_geo", "ne_10m_roads.geojson")
STATES_GEOJSON = os.path.join(BASE, "raw_geo", "us_states.geojson")
OUT_PATH = os.path.join(BASE, "..", "app", "public", "data", "tn_highways.geojson")

# Interstate numbers actually present in TN, so we can label "Major Highway"
# features correctly instead of guessing.
TN_INTERSTATES = {"24", "40", "55", "65", "75", "81", "26", "140", "155", "240", "440", "840"}


def load_tn_polygon():
    with open(STATES_GEOJSON) as f:
        states = json.load(f)
    for feat in states["features"]:
        if feat["properties"].get("name") == "Tennessee":
            return shape(feat["geometry"])
    raise SystemExit("Tennessee polygon not found in states file")


def main():
    tn_poly = load_tn_polygon().buffer(0.02)  # small buffer so edge routes aren't clipped off

    with open(ROADS_GEOJSON) as f:
        roads = json.load(f)

    out_features = []
    for feat in roads["features"]:
        geom = feat.get("geometry")
        props = feat.get("properties", {})
        if not geom:
            continue
        road_type = props.get("type")
        if road_type not in ("Major Highway", "Secondary Highway"):
            continue

        try:
            geom_shape = shape(geom)
        except Exception:
            continue
        if not tn_poly.intersects(geom_shape):
            continue

        clipped = tn_poly.intersection(geom_shape)
        if clipped.is_empty:
            continue

        name = (props.get("name") or "").strip()
        if road_type == "Major Highway":
            route_type = "Interstate" if name in TN_INTERSTATES else "Major Highway"
            route_label = f"I-{name}" if name in TN_INTERSTATES else name
        else:
            route_type = "US / State Route"
            route_label = f"Rte {name}" if name else "Route"

        out_features.append({
            "type": "Feature",
            "properties": {
                "route_type": route_type,
                "route_label": route_label,
                "raw_number": name,
            },
            "geometry": mapping(clipped),
        })

    out = {"type": "FeatureCollection", "features": out_features}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f)

    interstate_ct = sum(1 for f in out_features if f["properties"]["route_type"] == "Interstate")
    other_ct = len(out_features) - interstate_ct
    print(f"Wrote {len(out_features)} highway segments ({interstate_ct} interstate, {other_ct} other) to {OUT_PATH}")


if __name__ == "__main__":
    main()
