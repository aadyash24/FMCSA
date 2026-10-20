"""
Interim corridor analysis: places each crash on an interstate, US route or state
route at a mile position along that route, so the dashboard can plot crash
frequency from one end of a route to the other (e.g. I-40, Memphis to Bristol).

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
     Crashes coded US Route or State Route are snapped to the nearest US/state
     route line. The two codes are pooled because every TN US route also
     carries a state route number, so officers code the same road either way.
     The placeholder only gives a number, so a line is called US-n when n is a
     US route in Tennessee (US_ROUTES) and SR-n otherwise.
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
MIN_ROUTE_MI = 15  # drop short placeholder fragments; too short to profile
MAX_GAP_SHARE = 0.35  # drop US/state routes the placeholder only covers in scattered pieces

# US highways that run through Tennessee (base numbers; E/W/A splits share them).
US_ROUTES = {11, 19, 23, 25, 27, 31, 41, 43, 45, 51, 61, 64, 70, 72, 74, 76, 78, 79,
             127, 129, 231, 321, 341, 411, 412, 421, 431, 441, 641}
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


def route_suffix(label):
    tail = label.rstrip()
    return tail[-1] if tail and tail[-1].isalpha() and not tail.startswith("I-") else ""


def classify(feat_props):
    """(corridor id, class) for a placeholder feature."""
    p = feat_props
    if p["route_type"] == "Interstate":
        return p["route_label"], "Interstate"
    num = route_number(p["route_label"])
    suffix = route_suffix(p["route_label"])
    if num in US_ROUTES:
        return f"US-{num}{suffix}", "US Route"
    return f"SR-{num}{suffix}", "State Route"


CLASS_ORDER = {"Interstate": 0, "US Route": 1, "State Route": 2}


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
    route_class = {}
    for feat in highways["features"]:
        rid, cls = classify(feat["properties"])
        geom = project_geom(shape(feat["geometry"]))
        parts = [geom] if isinstance(geom, LineString) else list(geom.geoms)
        by_route.setdefault(rid, []).extend(parts)
        route_class[rid] = cls

    route_ids = sorted(by_route, key=lambda r: (CLASS_ORDER[route_class[r]], route_number(r), r))
    lines = [ordered_line(by_route[r], route_number(r)) for r in route_ids]
    def usable(r, ln):
        if route_class[r] == "Interstate":
            return True
        mapped = linemerge(by_route[r]).length  # length without the straight bridges
        return mapped >= MIN_ROUTE_MI and 1 - mapped / ln.length <= MAX_GAP_SHARE

    keep = [i for i, (r, ln) in enumerate(zip(route_ids, lines)) if usable(r, ln)]
    dropped = sorted(set(route_ids) - {route_ids[i] for i in keep})
    route_ids = [route_ids[i] for i in keep]
    lines = [lines[i] for i in keep]

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
                "class": route_class[rid],
                "lengthMi": round(line.length, 1),
                "direction": "south to north" if num % 2 else "west to east",
                "path": path,
                "counties": segments,
                "metros": metros,
            }
        )

    # Snap crashes: interstate-coded crashes to interstate lines, US/state-coded
    # crashes to US/state lines.
    route_key = crashes["keys"]["route"]
    code = {name: (route_key.index(name) if name in route_key else -1) for name in ("Interstate", "US Route", "State Route")}
    groups = {
        "Interstate": [i for i, r in enumerate(route_ids) if route_class[r] == "Interstate"],
        "Surface": [i for i, r in enumerate(route_ids) if route_class[r] != "Interstate"],
    }
    trees = {g: STRtree([lines[i] for i in idx]) for g, idx in groups.items()}
    cols = crashes["cols"]
    crash_route, crash_mile = [], []
    snapped = {"Interstate": 0, "Surface": 0}
    coded = {"Interstate": 0, "Surface": 0}
    for lat, lon, rcode in zip(cols["lat"], cols["lon"], cols["route"]):
        if rcode == code["Interstate"]:
            g = "Interstate"
        elif rcode in (code["US Route"], code["State Route"]):
            g = "Surface"
        else:
            g = None
        if g:
            coded[g] += 1
        if lat is None or g is None:
            crash_route.append(-1)
            crash_mile.append(None)
            continue
        pt = Point(to_xy(lon, lat))
        j = groups[g][int(trees[g].nearest(pt))]
        if lines[j].distance(pt) > SNAP_MI:
            crash_route.append(-1)
            crash_mile.append(None)
            continue
        crash_route.append(j)
        crash_mile.append(round(lines[j].project(pt), 2))
        snapped[g] += 1

    out = {
        "preliminary": True,
        "source": "Natural Earth placeholder route lines; replace with TDOT Road_Geometrics",
        "snapMiles": SNAP_MI,
        "routes": routes,
        "crashRoute": crash_route,
        "crashMile": crash_mile,
    }
    with open(os.path.join(DATA, "corridors.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"{len(routes)} routes: " + ", ".join(f"{r['id']} {r['lengthMi']} mi" for r in routes))
    print(f"Dropped {len(dropped)} fragmentary US/state routes: {', '.join(dropped)}")
    print(f"Snapped {snapped['Interstate']} of {coded['Interstate']} interstate crashes within {SNAP_MI} mi")
    print(f"Snapped {snapped['Surface']} of {coded['Surface']} US/state route crashes within {SNAP_MI} mi")


def project_geom_poly(geom):
    from shapely.geometry import MultiPolygon, Polygon

    def poly(p):
        return Polygon([to_xy(x, y) for x, y in p.exterior.coords], [[to_xy(x, y) for x, y in r.coords] for r in p.interiors])

    if isinstance(geom, Polygon):
        return poly(geom)
    return MultiPolygon([poly(p) for p in geom.geoms])


if __name__ == "__main__":
    main()
