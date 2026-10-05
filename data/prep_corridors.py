"""
Interim corridor analysis: places each interstate crash at a mile position along
its interstate, so the dashboard can plot crash frequency from one end of a
route to the other (e.g. I-40, Memphis to Bristol).

PRELIMINARY. The route lines are the Natural Earth placeholder in
tn_highways.geojson, not the TDOT Road_Geometrics file, so mile positions are
approximate (the placeholder is coarse and does not follow TDOT log miles).
Swap the source for Road_Geometrics once the .shp/.dbf/.shx arrive.

Method
  1. Merge each interstate's placeholder pieces into one ordered line, oriented
     the way interstate mileposts run: even-numbered (east-west) routes from the
     west, odd-numbered (north-south) routes from the south.
  2. Snap every crash coded as on an interstate (RouteSigningCde 01) to the
     nearest interstate line within SNAP_MI. The crash extract's own route
     number is blank for about 90% of interstate crashes, so it can't be used.
  3. Mile position = distance along the line to the snapped point.
  4. County extents along each route come from sampling the line every
     SAMPLE_MI against tn_counties.geojson; metro areas are named by county.

Inputs  app/public/data/crashes.json, tn_highways.geojson, tn_counties.geojson
Output  app/public/data/corridors.json

Run from the repo root (after prep_crash_data.py and prep_boundaries.py):
    python3 data/prep_corridors.py
"""

import json
import math
import os

from shapely.geometry import LineString, MultiLineString, Point, shape
from shapely.ops import linemerge
from shapely.strtree import STRtree

DATA = os.path.join(os.path.dirname(__file__), "..", "app", "public", "data")

SNAP_MI = 0.35  # the placeholder lines are coarse, so allow ~560 m
SAMPLE_MI = 0.25
LAT0 = 35.8  # projection reference latitude (middle of TN)
MI_PER_DEG_LAT = 69.0
MI_PER_DEG_LON = 69.17 * math.cos(math.radians(LAT0))

# Metro areas, named by the counties they cover (county-level approximation).
METRO_BY_COUNTY = {
    "Shelby": "Memphis",
    "Davidson": "Nashville",
    "Hamilton": "Chattanooga",
    "Knox": "Knoxville",
    "Montgomery": "Clarksville",
    "Madison": "Jackson",
    "Rutherford": "Murfreesboro",
    "Sullivan": "Kingsport / Bristol",
    "Washington": "Johnson City",
    "Putnam": "Cookeville",
}


def to_xy(lon, lat):
    return (lon * MI_PER_DEG_LON, lat * MI_PER_DEG_LAT)


def to_lonlat(x, y):
    return (x / MI_PER_DEG_LON, y / MI_PER_DEG_LAT)


def project_geom(geom):
    if isinstance(geom, LineString):
        return LineString([to_xy(x, y) for x, y in geom.coords])
    return MultiLineString([project_geom(g) for g in geom.geoms])


def route_number(label):
    return int("".join(ch for ch in label if ch.isdigit()))


def ordered_line(parts, number):
    """Stitch a route's pieces into one line, oriented like its mileposts."""
    merged = linemerge(parts)
    pieces = [merged] if isinstance(merged, LineString) else list(merged.geoms)
    north_south = number % 2 == 1
    axis = 1 if north_south else 0  # sort by y for N-S routes, x for E-W

    def oriented(line):
        c = list(line.coords)
        return c if c[0][axis] <= c[-1][axis] else c[::-1]

    pieces = sorted((oriented(p) for p in pieces), key=lambda c: min(pt[axis] for pt in c))
    coords = []
    for c in pieces:  # gaps between placeholder pieces are bridged straight
        coords.extend(c if not coords or coords[-1] != c[0] else c[1:])
    return LineString(coords)


def main():
    with open(os.path.join(DATA, "tn_highways.geojson")) as f:
        highways = json.load(f)
    with open(os.path.join(DATA, "tn_counties.geojson")) as f:
        counties = json.load(f)
    with open(os.path.join(DATA, "crashes.json")) as f:
        crashes = json.load(f)

    by_route = {}
    for feat in highways["features"]:
        p = feat["properties"]
        if p["route_type"] != "Interstate":
            continue
        geom = project_geom(shape(feat["geometry"]))
        parts = [geom] if isinstance(geom, LineString) else list(geom.geoms)
        by_route.setdefault(p["route_label"], []).extend(parts)

    route_ids = sorted(by_route, key=route_number)
    lines = [ordered_line(by_route[r], route_number(r)) for r in route_ids]

    county_shapes = [
        (f["properties"]["county"], project_geom_poly(shape(f["geometry"]))) for f in counties["features"]
    ]
    county_tree = STRtree([g for _, g in county_shapes])

    routes = []
    for rid, line in zip(route_ids, lines):
        # County runs along the route
        segments = []
        d = 0.0
        while d <= line.length:
            pt = line.interpolate(d)
            hits = [i for i in county_tree.query(pt) if county_shapes[i][1].covers(pt)]
            name = county_shapes[hits[0]][0] if hits else None
            if segments and segments[-1]["county"] == name:
                segments[-1]["toMi"] = round(d, 2)
            else:
                segments.append({"county": name, "fromMi": round(d, 2), "toMi": round(d, 2)})
            d += SAMPLE_MI
        segments = [s for s in segments if s["county"]]

        metros = []
        for s in segments:
            metro = METRO_BY_COUNTY.get(s["county"])
            if not metro:
                continue
            if metros and metros[-1]["name"] == metro and s["fromMi"] - metros[-1]["toMi"] <= 5:
                metros[-1]["toMi"] = s["toMi"]
            else:
                metros.append({"name": metro, "fromMi": s["fromMi"], "toMi": s["toMi"]})

        simplified = line.simplify(0.05)
        path = [[round(lat, 4), round(lon, 4)] for lon, lat in (to_lonlat(x, y) for x, y in simplified.coords)]
        num = route_number(rid)
        routes.append(
            {
                "id": rid,
                "lengthMi": round(line.length, 1),
                "direction": "south to north" if num % 2 else "west to east",
                "path": path,
                "counties": segments,
                "metros": metros,
            }
        )

    # Snap interstate crashes
    tree = STRtree(lines)
    route_key = crashes["keys"]["route"]
    interstate = route_key.index("Interstate") if "Interstate" in route_key else -1
    cols = crashes["cols"]
    crash_route, crash_mile = [], []
    snapped = 0
    for lat, lon, rcode in zip(cols["lat"], cols["lon"], cols["route"]):
        if lat is None or rcode != interstate:
            crash_route.append(-1)
            crash_mile.append(None)
            continue
        pt = Point(to_xy(lon, lat))
        i = tree.nearest(pt)
        if lines[i].distance(pt) > SNAP_MI:
            crash_route.append(-1)
            crash_mile.append(None)
            continue
        crash_route.append(int(i))
        crash_mile.append(round(lines[i].project(pt), 2))
        snapped += 1

    total_interstate = sum(1 for r in cols["route"] if r == interstate)
    out = {
        "preliminary": True,
        "source": "Natural Earth placeholder interstate lines; replace with TDOT Road_Geometrics",
        "snapMiles": SNAP_MI,
        "routes": routes,
        "crashRoute": crash_route,
        "crashMile": crash_mile,
    }
    with open(os.path.join(DATA, "corridors.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"{len(routes)} interstates: " + ", ".join(f"{r['id']} {r['lengthMi']} mi" for r in routes))
    print(f"Snapped {snapped} of {total_interstate} interstate crashes within {SNAP_MI} mi")


def project_geom_poly(geom):
    from shapely.geometry import MultiPolygon, Polygon

    def poly(p):
        return Polygon([to_xy(x, y) for x, y in p.exterior.coords], [[to_xy(x, y) for x, y in r.coords] for r in p.interiors])

    if isinstance(geom, Polygon):
        return poly(geom)
    return MultiPolygon([poly(p) for p in geom.geoms])


if __name__ == "__main__":
    main()
