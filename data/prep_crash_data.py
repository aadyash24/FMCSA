"""
Processes the raw FMCSA/TDOS CMV crash extract (raw_crash_data.csv) into small,
frontend-ready JSON files for the TN CMV Crash Dashboard (Mode 1: Data Exploration).

Code definitions below come from the TITAN (Tennessee Integrated Traffic Analysis
Network) crash report data dictionary published by NHTSA:
https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/tn_titan_schema_data_dictionary_sub6_2012.pdf

Run from the repo root:
    python3 data/prep_crash_data.py
"""

import csv
import json
import os

RAW_CSV = os.path.join(os.path.dirname(__file__), "..", "raw_crash_data.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "public", "data")

# --- Code dictionaries (TITAN data dictionary) --------------------------------

SEVERITY = {  # CrashTypeCde
    "01": "Fatal",
    "02": "Injury - Incapacitating",
    "03": "Injury - Non-Incapacitating",
    "04": "Injury - Possible",
    "05": "Property Damage",
    "06": "Property Damage (Under Threshold)",
    "99": "Unknown",
}

MANNER = {  # MannerCollisionCde
    "00": "Not Collision w/ Motor Vehicle in Transport",
    "01": "Front to Rear",
    "02": "Head-On",
    "03": "Angle",
    "04": "Sideswipe - Same Direction",
    "05": "Sideswipe - Opposite Direction",
    "06": "Rear to Side",
    "07": "Rear to Rear",
    "98": "Other",
    "99": "Unknown",
}

LIGHT = {  # LightConditionCde
    "01": "Daylight",
    "02": "Dark - Not Lighted",
    "03": "Dark - Lighted",
    "04": "Dark - Unknown Lighting",
    "05": "Dawn",
    "06": "Dusk",
    "98": "Other",
    "99": "Unknown",
}

WEATHER = {  # WeatherCde
    "01": "Clear",
    "02": "Cloudy",
    "03": "Fog",
    "04": "Smog/Smoke",
    "05": "Rain",
    "06": "Sleet/Hail",
    "07": "Snow",
    "08": "Blowing Snow",
    "09": "Severe Cross-Winds",
    "10": "Blowing Sand/Soil/Dirt",
    "98": "Other",
    "99": "Unknown",
}

ROUTE_SIGNING = {  # RouteSigningCde
    "01": "Interstate",
    "02": "US Route",
    "03": "State Route",
    "04": "County Route",
    "06": "Municipal Route",
    "07": "Frontage Road",
    "98": "Other",
    "99": "Unknown",
}

# TN county codes: alphabetical order 01-95, as used by TDOT/TITAN
TN_COUNTIES = [
    "Anderson", "Bedford", "Benton", "Bledsoe", "Blount", "Bradley", "Campbell",
    "Cannon", "Carroll", "Carter", "Cheatham", "Chester", "Claiborne", "Clay",
    "Cocke", "Coffee", "Crockett", "Cumberland", "Davidson", "Decatur", "DeKalb",
    "Dickson", "Dyer", "Fayette", "Fentress", "Franklin", "Gibson", "Giles",
    "Grainger", "Greene", "Grundy", "Hamblen", "Hamilton", "Hancock", "Hardeman",
    "Hardin", "Hawkins", "Haywood", "Henderson", "Henry", "Hickman", "Houston",
    "Humphreys", "Jackson", "Jefferson", "Johnson", "Knox", "Lake", "Lauderdale",
    "Lawrence", "Lewis", "Lincoln", "Loudon", "Macon", "Madison", "Marion",
    "Marshall", "Maury", "McMinn", "McNairy", "Meigs", "Monroe", "Montgomery",
    "Moore", "Morgan", "Obion", "Overton", "Perry", "Pickett", "Polk", "Putnam",
    "Rhea", "Roane", "Robertson", "Rutherford", "Scott", "Sequatchie", "Sevier",
    "Shelby", "Smith", "Stewart", "Sullivan", "Sumner", "Tipton", "Trousdale",
    "Unicoi", "Union", "Van Buren", "Warren", "Washington", "Wayne", "Weakley",
    "White", "Williamson", "Wilson",
]
# NOTE: TN has 95 counties, coded 01-95 in alphabetical order by TDOT/TITAN.
# If a code comes back blank/unmapped, `county_name()` falls back to the raw
# code instead of guessing.
COUNTY_BY_CODE = {f"{i+1:02d}": name for i, name in enumerate(TN_COUNTIES)}


def county_name(code):
    return COUNTY_BY_CODE.get(code, f"County {code}" if code and code != "Na" else "Unknown")


def label(mapping, code):
    return mapping.get(code, "Unknown" if code in ("", "Na", None) else f"Other ({code})")


def safe_int(v, default=0):
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    years = {}
    county_counts = {}
    manner_counts = {}
    light_counts = {}
    weather_counts = {}
    route_counts = {}
    severity_by_year = {}
    points = []

    total = 0
    total_fatalities = 0
    total_injuries = 0
    min_year, max_year = None, None

    with open(RAW_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = row.get("Year", "").strip()
            if not year.isdigit():
                continue
            total += 1

            sev_code = row.get("CrashTypeCde", "").strip()
            manner_code = row.get("MannerCollisionCde", "").strip()
            light_code = row.get("LightConditionCde", "").strip()
            weather_code = row.get("WeatherCde", "").strip()
            route_code = row.get("RouteSigningCde", "").strip()
            county_code = row.get("CountyStateCde", "").strip()

            fatalities = safe_int(row.get("NbrFatalitiesNmb"))
            injured = safe_int(row.get("NbrInjuredNmb"))
            total_fatalities += fatalities
            total_injuries += injured

            min_year = year if min_year is None else min(min_year, year)
            max_year = year if max_year is None else max(max_year, year)

            y = years.setdefault(year, {"year": year, "crashes": 0, "fatalities": 0, "injured": 0})
            y["crashes"] += 1
            y["fatalities"] += fatalities
            y["injured"] += injured

            sev_label = label(SEVERITY, sev_code)
            severity_by_year.setdefault(year, {}).setdefault(sev_label, 0)
            severity_by_year[year][sev_label] += 1

            cname = county_name(county_code)
            c = county_counts.setdefault(cname, {"county": cname, "crashes": 0, "fatalities": 0, "injured": 0})
            c["crashes"] += 1
            c["fatalities"] += fatalities
            c["injured"] += injured

            mlabel = label(MANNER, manner_code)
            manner_counts[mlabel] = manner_counts.get(mlabel, 0) + 1

            llabel = label(LIGHT, light_code)
            light_counts[llabel] = light_counts.get(llabel, 0) + 1

            wlabel = label(WEATHER, weather_code)
            weather_counts[wlabel] = weather_counts.get(wlabel, 0) + 1

            rlabel = label(ROUTE_SIGNING, route_code)
            route_counts[rlabel] = route_counts.get(rlabel, 0) + 1

            lat = row.get("LatDecimalNmb", "").strip()
            lon = row.get("LongDecimalNmb", "").strip()
            if lat and lon:
                try:
                    lat_f, lon_f = float(lat), float(lon)
                    if 34.0 < lat_f < 37.0 and -91.0 < lon_f < -81.0:
                        points.append([round(lat_f, 4), round(lon_f, 4), int(year), sev_label])
                except ValueError:
                    pass

    # Assemble severity-by-year as a flat array for stacked bar charts
    all_severities = sorted({s for yr in severity_by_year.values() for s in yr})
    severity_series = []
    for year in sorted(severity_by_year):
        entry = {"year": year}
        for s in all_severities:
            entry[s] = severity_by_year[year].get(s, 0)
        severity_series.append(entry)

    def to_sorted_list(counter_dict, key_name):
        return sorted(
            ({key_name: k, "count": v} for k, v in counter_dict.items()),
            key=lambda r: -r["count"],
        )

    summary = {
        "totalCrashes": total,
        "totalFatalities": total_fatalities,
        "totalInjured": total_injuries,
        "yearRange": [min_year, max_year],
        "generatedFrom": "CMV_crash_database.csv (FMCSA project, TN TITAN extract)",
    }

    yearly = sorted(years.values(), key=lambda r: r["year"])

    with open(os.path.join(OUT_DIR, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    with open(os.path.join(OUT_DIR, "yearly.json"), "w") as f:
        json.dump(yearly, f, indent=2)

    with open(os.path.join(OUT_DIR, "severity_by_year.json"), "w") as f:
        json.dump({"series": severity_series, "keys": all_severities}, f, indent=2)

    with open(os.path.join(OUT_DIR, "county.json"), "w") as f:
        json.dump(sorted(county_counts.values(), key=lambda r: -r["crashes"]), f, indent=2)

    with open(os.path.join(OUT_DIR, "manner.json"), "w") as f:
        json.dump(to_sorted_list(manner_counts, "manner"), f, indent=2)

    with open(os.path.join(OUT_DIR, "light.json"), "w") as f:
        json.dump(to_sorted_list(light_counts, "condition"), f, indent=2)

    with open(os.path.join(OUT_DIR, "weather.json"), "w") as f:
        json.dump(to_sorted_list(weather_counts, "weather"), f, indent=2)

    with open(os.path.join(OUT_DIR, "route.json"), "w") as f:
        json.dump(to_sorted_list(route_counts, "route"), f, indent=2)

    with open(os.path.join(OUT_DIR, "points.json"), "w") as f:
        json.dump(points, f)

    print(f"Processed {total} rows ({min_year}-{max_year})")
    print(f"Fatalities: {total_fatalities}, Injured: {total_injuries}")
    print(f"{len(points)} rows had usable lat/long")
    print(f"Wrote JSON to {OUT_DIR}")


if __name__ == "__main__":
    main()
