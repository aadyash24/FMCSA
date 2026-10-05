"""
Processes the raw FMCSA/TDOS CMV crash extract (raw_crash_data.csv) into small,
frontend-ready JSON for the TN CMV Crash Dashboard: summary.json plus crashes.json,
one row per crash, which the app filters and aggregates in the browser.

Code definitions below come from the TITAN (Tennessee Integrated Traffic Analysis
Network) crash report data dictionary published by NHTSA:
https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/tn_titan_schema_data_dictionary_sub6_2012.pdf

Optional inputs, used when present (the columns fall back to "Not recorded"):
  UNIT_CSV          Unit.csv from the supervisor's 10/5 extract, for road surface
  AGENCY_LOOKUP     vwLookup_Agency.txt from the TITAN export, for agency names
  FAULT_CSV         data/fault/output/fault_crashes.csv (run data/fault/score_fault.py first)

Run from the repo root:
    python3 data/prep_crash_data.py
"""

import csv
import json
import os
from datetime import date

RAW_CSV = os.path.join(os.path.dirname(__file__), "..", "raw_crash_data.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "public", "data")
UNIT_CSV = os.path.expanduser("~/Desktop/FMCSA Related Crashes/Unit.csv")
AGENCY_LOOKUP = os.path.expanduser("~/Desktop/Clean Up/FMCSA/TITAN Crash Database (Processed)/vwLookup_Agency.txt")
FAULT_CSV = os.path.join(os.path.dirname(__file__), "fault", "output", "fault_crashes.csv")

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

SURFACE = {  # Unit.SurfCondCde
    "01": "Dry",
    "02": "Wet",
    "03": "Snow or Slush",
    "04": "Ice/Frost",
    "05": "Sand, Dirt, Mud, Gravel",
    "06": "Standing/Moving Water",
    "07": "Oil",
    "80": "Sand, Dirt, Mud, Gravel",
    "98": "Other",
    "99": "Unknown",
}

SCHOOL_BUS = {"00": "No", "01": "Yes", "02": "Yes", "80": "Yes"}  # SchoolBusCde: directly or indirectly

NOT_RECORDED_LABEL = "Not recorded"


def yes_no(v):
    return {"Y": "Yes", "N": "No"}.get((v or "").strip().upper(), NOT_RECORDED_LABEL)


def load_surface():
    """Road surface per crash from the first unit that has one (Unit.csv is unit-level)."""
    out = {}
    if not os.path.exists(UNIT_CSV):
        return out
    with open(UNIT_CSV, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            v = (r.get("SurfCondCde") or "").strip().removesuffix(".0")
            if v.isdigit() and r["MstrRecNbrTxt"].strip() not in out:
                out[r["MstrRecNbrTxt"].strip()] = SURFACE.get(v.zfill(2), "Other")
    return out


def load_agencies():
    names = {}
    if os.path.exists(AGENCY_LOOKUP):
        with open(AGENCY_LOOKUP, encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f, delimiter="|"):
                names[r["AgencyORITxt"].strip()] = r["AgencyNameTxt"].strip().title().replace("Thp ", "THP ")
    return names


def agency_name(names, ori):
    ori = (ori or "").strip()
    if not ori:
        return "Unknown"
    if ori in names:
        return names[ori]
    if ori.startswith("THP"):  # THP0300 = Highway Patrol district 3; not in the lookup
        return f"Tennessee Highway Patrol (District {int(ori[3:5] or 0)})" if ori[3:5].isdigit() else "Tennessee Highway Patrol"
    return f"Agency {ori}"


def load_fault():
    """Fault outcome per crash for both views; 'Out of scope' when not scored."""
    out = {}
    if not os.path.exists(FAULT_CSV):
        return out
    with open(FAULT_CSV, newline="") as f:
        for r in csv.DictReader(f):
            out[r["crash_id"]] = (
                r["outcome"] if r["scope"] == "In scope" else "Out of scope",
                r["geo_outcome"] or "Out of scope",
            )
    return out


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


def units_label(v):
    n = safe_int(v, default=-1)
    if n < 0:
        return "Unknown"
    if n <= 1:
        return "Single vehicle"
    if n == 2:
        return "Two vehicles"
    return "Three or more"


INDICATOR = {"N": 0, "Y": 1}  # anything else (blank, "Na") -> 2 = not recorded
NOT_RECORDED = 2


def indicator(v):
    return INDICATOR.get((v or "").strip().upper(), NOT_RECORDED)


class Coder:
    """Maps labels to small ints so each crash row stores numbers, not strings."""

    def __init__(self):
        self.keys = []
        self._index = {}

    def __call__(self, label_text):
        i = self._index.get(label_text)
        if i is None:
            i = self._index[label_text] = len(self.keys)
            self.keys.append(label_text)
        return i


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    fields = ["severity", "manner", "weather", "light", "route", "county", "units",
              "surface", "workZone", "intersection", "schoolBus", "agency", "faultFull", "faultGeo"]
    coders = {f: Coder() for f in fields}
    cols = {
        "lat": [], "lon": [], "year": [], "fatalities": [], "injured": [],
        "towed": [], "injTrans": [], "hour": [], "dow": [], "month": [], **{f: [] for f in fields},
    }
    surface = load_surface()
    agencies = load_agencies()
    fault = load_fault()

    total_fatalities = 0
    total_injuries = 0
    min_year, max_year = None, None
    last_date = ""
    with_coords = 0

    with open(RAW_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = row.get("Year", "").strip()
            if not year.isdigit():
                continue

            fatalities = safe_int(row.get("NbrFatalitiesNmb"))
            injured = safe_int(row.get("NbrInjuredNmb"))
            total_fatalities += fatalities
            total_injuries += injured
            min_year = year if min_year is None else min(min_year, year)
            max_year = year if max_year is None else max(max_year, year)
            last_date = max(last_date, row.get("CollisionDte", "")[:10])

            lat_f = lon_f = None
            try:
                lat_v = float(row.get("LatDecimalNmb", "").strip())
                lon_v = float(row.get("LongDecimalNmb", "").strip())
                if 34.0 < lat_v < 37.0 and -91.0 < lon_v < -81.0:
                    lat_f, lon_f = round(lat_v, 4), round(lon_v, 4)
                    with_coords += 1
            except ValueError:
                pass

            # Every crash is kept, with or without coordinates, so chart totals
            # match the stat cards. The map skips rows whose lat is null.
            cols["lat"].append(lat_f)
            cols["lon"].append(lon_f)
            cols["year"].append(int(year))
            cols["fatalities"].append(fatalities)
            cols["injured"].append(injured)
            cols["towed"].append(indicator(row.get("TowedInd")))
            cols["injTrans"].append(indicator(row.get("InjuredTransInd")))
            cols["severity"].append(coders["severity"](label(SEVERITY, row.get("CrashTypeCde", "").strip())))
            cols["manner"].append(coders["manner"](label(MANNER, row.get("MannerCollisionCde", "").strip())))
            cols["weather"].append(coders["weather"](label(WEATHER, row.get("WeatherCde", "").strip())))
            cols["light"].append(coders["light"](label(LIGHT, row.get("LightConditionCde", "").strip())))
            cols["route"].append(coders["route"](label(ROUTE_SIGNING, row.get("RouteSigningCde", "").strip())))
            cols["county"].append(coders["county"](county_name(row.get("CountyStateCde", "").strip())))
            cols["units"].append(coders["units"](units_label(row.get("NbrUnitsNmb"))))

            # Time of day / weekday / month for the time charts; -1 when unparseable.
            hh = (row.get("CollisionTimeTxt") or "")[:2]
            cols["hour"].append(int(hh) if hh.isdigit() and int(hh) < 24 else -1)
            try:
                d = date.fromisoformat(row.get("CollisionDte", "")[:10])
                cols["dow"].append(d.weekday())  # 0 = Monday
                cols["month"].append(d.month)
            except ValueError:
                cols["dow"].append(-1)
                cols["month"].append(-1)

            key = row.get("MstrRecNbrTxt", "").strip()
            cols["surface"].append(coders["surface"](surface.get(key, NOT_RECORDED_LABEL)))
            # Work zone: ConstructionMaintZoneCde is only filled in when the crash was in one.
            cols["workZone"].append(coders["workZone"]("Yes" if row.get("ConstructionMaintZoneCde", "").strip() else "No"))
            cols["intersection"].append(coders["intersection"](yes_no(row.get("IntersectionInd"))))
            cols["schoolBus"].append(
                coders["schoolBus"](SCHOOL_BUS.get(row.get("SchoolBusCde", "").strip(), NOT_RECORDED_LABEL))
            )
            cols["agency"].append(coders["agency"](agency_name(agencies, row.get("AgencyOriTxt"))))
            full, geo = fault.get(key, ("Out of scope", "Out of scope"))
            cols["faultFull"].append(coders["faultFull"](full))
            cols["faultGeo"].append(coders["faultGeo"](geo))

    total = len(cols["year"])
    summary = {
        "totalCrashes": total,
        "totalFatalities": total_fatalities,
        "totalInjured": total_injuries,
        "yearRange": [min_year, max_year],
        "generatedFrom": "CMV_crash_database.csv (FMCSA project, TN TITAN extract)",
    }

    with open(os.path.join(OUT_DIR, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    # Column-oriented: one array per field, categorical fields stored as indexes
    # into keys[field]. The dashboard filters and aggregates these in the
    # browser, so every chart follows the same filters as the map.
    # towed / injTrans: 0 = No, 1 = Yes, 2 = not recorded.
    with open(os.path.join(OUT_DIR, "crashes.json"), "w") as f:
        json.dump(
            # lastDate lets the app flag a partial final year (the extract ends mid-year).
            {"n": total, "lastDate": last_date, "keys": {k: c.keys for k, c in coders.items()}, "cols": cols},
            f,
            separators=(",", ":"),
        )

    print(f"Processed {total} rows ({min_year}-{max_year})")
    print(f"Fatalities: {total_fatalities}, Injured: {total_injuries}")
    print(f"{with_coords} rows had usable lat/long")
    print(f"Road surface found for {sum(1 for k in coders['surface'].keys if k)} categories, "
          f"{len(surface)} crashes; agencies named: {len(agencies)}; fault rows: {len(fault)}")
    print(f"Wrote JSON to {OUT_DIR}")


if __name__ == "__main__":
    main()
