"""
Builds the Tennessee boundary layers the map uses:

  tn_counties.geojson  95 county polygons (simplified), for county click/focus
  tn_mask.geojson      everything outside Tennessee, drawn as a grey veil so the
                       map reads as "Tennessee only"

Source: US Census county boundaries as republished by plotly/datasets
(geojson-counties-fips.json). Download it to data/raw_geo/us_counties.json:

    curl -L -o data/raw_geo/us_counties.json \
      https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json

Run from the repo root:
    python3 data/prep_boundaries.py
"""

import json
import os

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

BASE = os.path.dirname(__file__)
SRC = os.path.join(BASE, "raw_geo", "us_counties.json")
OUT_DIR = os.path.join(BASE, "..", "app", "public", "data")

TN_FIPS = "47"
SIMPLIFY_DEG = 0.004  # about 400 m, invisible at county zoom levels


def rounded(geom, places=4):
    """Round coordinates so the GeoJSON stays small."""
    return json.loads(json.dumps(mapping(geom)), parse_float=lambda v: round(float(v), places))


def main():
    with open(SRC) as f:
        counties = json.load(f)

    shapes, features = [], []
    for feat in counties["features"]:
        props = feat["properties"]
        if props.get("STATE") != TN_FIPS:
            continue
        geom = shape(feat["geometry"])
        shapes.append(geom)
        features.append(
            {
                "type": "Feature",
                "properties": {"county": props["NAME"]},
                "geometry": rounded(geom.simplify(SIMPLIFY_DEG, preserve_topology=True)),
            }
        )

    features.sort(key=lambda f: f["properties"]["county"])
    with open(os.path.join(OUT_DIR, "tn_counties.geojson"), "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    tn = unary_union(shapes).simplify(SIMPLIFY_DEG, preserve_topology=True)
    mask = box(-100, 25, -70, 45).difference(tn)
    with open(os.path.join(OUT_DIR, "tn_mask.geojson"), "w") as f:
        json.dump(
            {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": rounded(mask)}]},
            f,
            separators=(",", ":"),
        )

    print(f"Wrote {len(features)} counties and the outside-TN mask to {OUT_DIR}")


if __name__ == "__main__":
    main()
