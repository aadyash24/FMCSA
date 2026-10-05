"""
Rule-based fault scoring for two-vehicle truck vs. non-truck crashes.

Input is the supervisor's 10/5 TITAN extract (CMV_crash_database.csv, Unit.csv,
CommercialUnit.csv, Person.csv, Person_Detail.csv, Person_Action.csv,
Person_Violation.csv). Person tables in that extract cover mostly 2023-2025, so
older crashes land in "Out of scope: no driver records" rather than being dropped.

Method
  1. Scope: exactly 2 units, exactly one of them in CommercialUnit, and a driver
     record (PersonTypeCde 01) for both units. Every other crash gets an
     out-of-scope reason instead of disappearing.
  2. Each driver collects fault points from rules.json: officer-coded action,
     citation, alcohol, drugs, license status, and maneuver/impact geometry.
     Strongest hit per category; categories add; total capped at 1. Geometry
     is capped lower, since it corroborates more than it attributes.
  3. Completeness = share of the 7 inputs that are known for that driver.
     Missing is not innocent: unknown inputs add no points but lower it.
  4. Outcome per crash:
       Undetermined      both drivers below the threshold
       Equal fault       scores within the equal band
       Truck driver / Non-truck driver   the higher score
     Basis says whether the at-fault call rests on officer-coded evidence
     (action, citation, impairment, license) or on geometry alone.

Severity is reported by bucket but never used as an input.

Outputs (data/fault/output/, no names or addresses, codes only)
  fault_crashes.csv   one row per crash, scope reason, scores, outcome, reasons
  fault_summary.json  funnel by year, outcome by severity and basis, top reasons
  fault_points.json   [lat, lon, year, severity bucket, outcome] for the map
  Also copies fault_summary.json to app/public/data/ for the At-Fault tab.

Run from the repo root:
    python3 data/fault/score_fault.py [--input "~/Desktop/FMCSA Related Crashes"]
"""

import argparse
import csv
import json
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT = os.path.expanduser("~/Desktop/FMCSA Related Crashes")
OUT_DIR = os.path.join(HERE, "output")
APP_DATA = os.path.join(HERE, "..", "..", "app", "public", "data")

SEVERITY_BUCKET = {  # CrashTypeCde
    "01": "Fatal",
    "02": "Injury", "03": "Injury", "04": "Injury", "80": "Injury",
    "05": "Property damage", "06": "Property damage",
}
OUTCOMES = ["Truck driver", "Non-truck driver", "Equal fault", "Undetermined"]


def code(value):
    """Normalize a TITAN code: '9' and '09' are the same code, blank stays blank."""
    v = (value or "").strip()
    if v.endswith(".0"):
        v = v[:-2]
    return v.zfill(2) if v.isdigit() else v


def read(folder, name):
    with open(os.path.join(folder, name), newline="", encoding="utf-8", errors="replace") as f:
        yield from csv.DictReader(f)


def load(folder):
    crashes = {}
    for r in read(folder, "CMV_crash_database.csv"):
        k = r["MstrRecNbrTxt"].strip()
        if not k:
            continue
        date = r.get("CollisionDte", "").strip()
        year = date[:4] if date[:4].isdigit() else ""
        if not year and "/" in date:  # m/d/yyyy
            year = date.split(" ")[0].split("/")[-1]
        crashes[k] = {
            "year": year,
            "severity": SEVERITY_BUCKET.get(code(r.get("CrashTypeCde")), "Unknown"),
            "manner": code(r.get("MannerCollisionCde")),
            "county": r.get("CountyStateCde", "").strip(),
            "lat": r.get("LatDecimalNmb", "").strip(),
            "lon": r.get("LongDecimalNmb", "").strip(),
        }

    units = defaultdict(dict)  # crash -> unit id -> fields
    for r in read(folder, "Unit.csv"):
        units[r["MstrRecNbrTxt"].strip()][r["UnitIDNmb"].strip()] = {
            "maneuver": code(r.get("ManeuverCde")),
            "impact": code(r.get("FirstImpactCde")),
            "surface": code(r.get("SurfCondCde")),
        }

    commercial = defaultdict(set)
    for r in read(folder, "CommercialUnit.csv"):
        commercial[r["MstrRecNbrTxt"].strip()].add(r["UnitIDNmb"].strip())

    drivers = {}  # (crash, unit) -> person id; first driver record wins
    for r in read(folder, "Person.csv"):
        if code(r.get("PersonTypeCde")) == "01":
            drivers.setdefault((r["MstrRecNbrTxt"].strip(), r["UnitIDNmb"].strip()),
                               r["PersonIDNmb"].strip())

    detail = {}
    for r in read(folder, "Person_Detail.csv"):
        detail[(r["MstrRecNbrTxt"].strip(), r["UnitIDNmb"].strip(), r["PersonIDNmb"].strip())] = {
            "alcohol": code(r.get("AlcoholPresenceCde")),
            "drug": code(r.get("DrugPresenceCde")),
            "license": code(r.get("DLStatusCde")),
        }

    actions = defaultdict(set)
    for r in read(folder, "Person_Action.csv"):
        actions[(r["MstrRecNbrTxt"].strip(), r["UnitIDNmb"].strip(), r["PersonIDNmb"].strip())].add(
            code(r.get("ActionCde")))

    violations = defaultdict(set)
    for r in read(folder, "Person_Violation.csv"):
        violations[(r["MstrRecNbrTxt"].strip(), r["UnitIDNmb"].strip(), r["PersonIDNmb"].strip())].add(
            code(r.get("ViolationCategoryCde")))

    return crashes, units, commercial, drivers, detail, actions, violations


def vehicle_scope(k, units, commercial):
    """Return (truck unit, other unit, None) or (None, None, out-of-scope reason)."""
    us = units.get(k)
    if not us:
        return None, None, "No unit records"
    if len(us) != 2:
        return None, None, "Single vehicle" if len(us) == 1 else "3+ vehicles"
    cmv = commercial.get(k, set()) & set(us)
    if len(cmv) != 1:
        return None, None, "Both vehicles commercial" if len(cmv) == 2 else "No commercial unit identified"
    truck = next(iter(cmv))
    return truck, next(u for u in us if u != truck), None


def driver_scope(k, truck, other, drivers):
    """Out-of-scope reason for the full view, or None when both drivers are on file."""
    have = ((k, truck) in drivers) + ((k, other) in drivers)
    return None if have == 2 else "One driver record missing" if have == 1 else "No driver records"


def score_geometry(rules, tu, ou, manner):
    """Geometry-only view: both vehicles scored on maneuver/impact alone, no person data.
    Symmetric by construction, so a missing driver record can't tilt the result."""
    t = rules["thresholds"]
    ft, rt = geometry_points(rules, tu, ou, manner)
    fo, ro = geometry_points(rules, ou, tu, manner)
    if ft < t["undetermined_below"] and fo < t["undetermined_below"]:
        unknown = rules["maneuver_unknown"]
        if any(u["maneuver"] in unknown or u["impact"] in rules["impact_unknown"] for u in (tu, ou)):
            reason = "Insufficient data"
        elif tu["surface"] in rules["surface"]["adverse"] or ou["surface"] in rules["surface"]["adverse"]:
            reason = "Adverse road surface, no pattern"
        else:
            reason = "No geometry pattern"
        return "Undetermined", reason, ft, fo, rt or "", ro or ""
    if abs(ft - fo) < t["equal_within"]:
        return "Equal fault", "", ft, fo, rt or "", ro or ""
    return ("Truck driver" if ft > fo else "Non-truck driver"), "", ft, fo, rt or "", ro or ""


def geometry_points(rules, self_u, other_u, manner):
    best, label = 0.0, None
    for g in rules["geometry"]["rules"]:
        checks = [
            ("self_maneuver", self_u["maneuver"]), ("self_impact", self_u["impact"]),
            ("other_maneuver", other_u["maneuver"]), ("other_impact", other_u["impact"]),
            ("manner", manner),
        ]
        if all(v in g[key] for key, v in checks if key in g) and g["points"] > best:
            best, label = g["points"], g["label"]
    return min(best, rules["thresholds"]["geometry_cap"]), label


def score_driver(rules, k, unit_id, person_id, self_u, other_u, manner, detail, actions, violations):
    pkey = (k, unit_id, person_id)
    d = detail.get(pkey, {"alcohol": "", "drug": "", "license": ""})
    acts = actions.get(pkey, set())
    viols = violations.get(pkey, set())

    hits = []  # (category, points, reason)

    def strongest(category, table, codes_):
        found = [(table[c][0], table[c][1]) for c in codes_ if c in table and not c.startswith("_")]
        if found:
            pts, why = max(found)
            hits.append((category, pts, why))

    strongest("action", rules["action"], acts)
    strongest("violation", rules["violation"], viols)
    strongest("alcohol", rules["alcohol"], [d["alcohol"]])
    strongest("drug", rules["drug"], [d["drug"]])
    strongest("license", rules["license"], [d["license"]])
    g_pts, g_why = geometry_points(rules, self_u, other_u, manner)
    if g_pts:
        hits.append(("geometry", g_pts, g_why))

    total = min(1.0, sum(p for _, p, _ in hits))
    behavior = any(c != "geometry" for c, _, _ in hits)

    known = [
        self_u["maneuver"] not in rules["maneuver_unknown"],
        self_u["impact"] not in rules["impact_unknown"],
        self_u["surface"] not in rules["surface"]["unknown"],
        d["alcohol"] not in rules["presence_unknown"],
        d["drug"] not in rules["presence_unknown"],
        d["license"] not in rules["license_unknown"],
        any(a not in ("", "99") for a in acts),
    ]
    completeness = sum(known) / len(known)
    reasons = "; ".join(f"{why} (+{p:g})" for _, p, why in sorted(hits, key=lambda h: -h[1]))
    return round(total, 3), behavior, round(completeness, 2), reasons


def decide(rules, f_truck, f_other, beh_truck, beh_other, comp_truck, comp_other, adverse):
    t = rules["thresholds"]
    if f_truck < t["undetermined_below"] and f_other < t["undetermined_below"]:
        if min(comp_truck, comp_other) < t["min_completeness"]:
            return "Undetermined", "Insufficient data"
        if adverse:
            return "Undetermined", "Adverse road surface, neither driver coded"
        return "Undetermined", "No fault signal"
    if abs(f_truck - f_other) < t["equal_within"]:
        return "Equal fault", "Officer-coded" if (beh_truck or beh_other) else "Geometry only"
    if f_truck > f_other:
        return "Truck driver", "Officer-coded" if beh_truck else "Geometry only"
    return "Non-truck driver", "Officer-coded" if beh_other else "Geometry only"


def write_points(rows, outcome_field, name):
    points = []
    for r in rows:
        try:
            lat, lon = round(float(r["lat"]), 5), round(float(r["lon"]), 5)
        except ValueError:
            continue
        if lat and lon:
            points.append([lat, lon, int(r["year"]) if r["year"].isdigit() else None,
                           r["severity"], OUTCOMES.index(r[outcome_field])])
    with open(os.path.join(OUT_DIR, name), "w") as f:
        json.dump({"outcomes": OUTCOMES, "points": points}, f, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=DEFAULT_INPUT)
    ap.add_argument("--rules", default=os.path.join(HERE, "rules.json"))
    args = ap.parse_args()

    with open(args.rules) as f:
        rules = json.load(f)
    crashes, units, commercial, drivers, detail, actions, violations = load(os.path.expanduser(args.input))

    rows = []
    for k, c in crashes.items():
        row = {"crash_id": k, "year": c["year"], "severity": c["severity"], "county": c["county"],
               "manner": c["manner"], "lat": c["lat"], "lon": c["lon"]}
        truck, other, out = vehicle_scope(k, units, commercial)
        if out:
            row.update(scope="Out of scope", scope_reason=out, outcome="", basis="")
            rows.append(row)
            continue

        tu, ou = units[k][truck], units[k][other]
        go, gr, gft, gfo, grt, gro = score_geometry(rules, tu, ou, c["manner"])
        row.update(geo_outcome=go, geo_reason=gr, geo_f_truck=gft, geo_f_other=gfo,
                   geo_pattern_truck=grt, geo_pattern_other=gro)

        out = driver_scope(k, truck, other, drivers)
        if out:
            row.update(scope="Out of scope", scope_reason=out, outcome="", basis="")
            rows.append(row)
            continue

        ft, bt, ct, rt = score_driver(rules, k, truck, drivers[(k, truck)], tu, ou, c["manner"],
                                      detail, actions, violations)
        fo, bo, co, ro = score_driver(rules, k, other, drivers[(k, other)], ou, tu, c["manner"],
                                      detail, actions, violations)
        adverse = tu["surface"] in rules["surface"]["adverse"] or ou["surface"] in rules["surface"]["adverse"]
        outcome, basis = decide(rules, ft, fo, bt, bo, ct, co, adverse)
        share = round(ft / (ft + fo), 2) if ft + fo else ""
        row.update(scope="In scope", scope_reason="", outcome=outcome, basis=basis,
                   f_truck=ft, f_other=fo, truck_share=share,
                   completeness_truck=ct, completeness_other=co,
                   reasons_truck=rt, reasons_other=ro)
        rows.append(row)

    os.makedirs(OUT_DIR, exist_ok=True)
    fields = ["crash_id", "year", "severity", "county", "manner", "lat", "lon", "scope", "scope_reason",
              "outcome", "basis", "f_truck", "f_other", "truck_share", "completeness_truck",
              "completeness_other", "reasons_truck", "reasons_other",
              "geo_outcome", "geo_reason", "geo_f_truck", "geo_f_other", "geo_pattern_truck", "geo_pattern_other"]
    with open(os.path.join(OUT_DIR, "fault_crashes.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, restval="")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["year"], r["crash_id"])))

    scored = [r for r in rows if r["scope"] == "In scope"]
    funnel = defaultdict(Counter)
    for r in rows:
        funnel[r["year"] or "unknown"][r["scope_reason"] or "In scope"] += 1
    by_sev = defaultdict(Counter)
    for r in scored:
        by_sev[r["severity"]][r["outcome"]] += 1
    basis = defaultdict(Counter)
    for r in scored:
        basis[r["outcome"]][r["basis"]] += 1
    geo = [r for r in rows if r.get("geo_outcome")]
    geo_by_sev = defaultdict(Counter)
    for r in geo:
        geo_by_sev[r["severity"]][r["geo_outcome"]] += 1
    agreement = Counter((r["outcome"], r["geo_outcome"]) for r in scored)  # full view | geometry view
    reasons = {"truck": Counter(), "other": Counter()}
    for r in scored:
        for side in ("truck", "other"):
            for part in filter(None, r[f"reasons_{side}"].split("; ")):
                reasons[side][part.rsplit(" (+", 1)[0]] += 1

    summary = {
        "rules_version": rules["version"],
        "crashes": len(rows),
        "in_scope": len(scored),
        "funnel_by_year": {y: dict(c) for y, c in sorted(funnel.items())},
        "outcome": dict(Counter(r["outcome"] for r in scored)),
        "outcome_by_severity": {s: dict(c) for s, c in by_sev.items()},
        "basis_by_outcome": {o: dict(c) for o, c in basis.items()},
        "undetermined_reasons": dict(Counter(r["basis"] for r in scored if r["outcome"] == "Undetermined")),
        "top_reasons_truck": dict(reasons["truck"].most_common(12)),
        "top_reasons_other": dict(reasons["other"].most_common(12)),
        "geometry_view": {
            "in_scope": len(geo),
            "in_scope_by_year": dict(sorted(Counter(r["year"] or "unknown" for r in geo).items())),
            "outcome": dict(Counter(r["geo_outcome"] for r in geo)),
            "outcome_by_severity": {s: dict(c) for s, c in geo_by_sev.items()},
            "undetermined_reasons": dict(Counter(r["geo_reason"] for r in geo if r["geo_reason"])),
            "top_patterns_truck": dict(Counter(r["geo_pattern_truck"] for r in geo if r["geo_pattern_truck"]).most_common(10)),
            "top_patterns_other": dict(Counter(r["geo_pattern_other"] for r in geo if r["geo_pattern_other"]).most_common(10)),
            "agreement_with_full_view": {f"{a} | {b}": v for (a, b), v in agreement.most_common()},
        },
    }
    # The dashboard reads the summary (reasons, coverage); per-crash outcomes reach it
    # through prep_crash_data.py, which joins fault_crashes.csv onto crashes.json.
    for folder in (OUT_DIR, APP_DATA):
        with open(os.path.join(folder, "fault_summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

    write_points(scored, "outcome", "fault_points.json")
    write_points(geo, "geo_outcome", "fault_points_geometry.json")

    # ---- console report ------------------------------------------------------
    print(f"Crashes: {len(rows):,}   in scope (2-vehicle truck vs non-truck, both drivers): {len(scored):,}")
    print("\nOut-of-scope reasons:")
    for k2, v in Counter(r["scope_reason"] for r in rows if r["scope_reason"]).most_common():
        print(f"  {v:>7,}  {k2}")
    print("\nIn scope by year:")
    for y, c in sorted(funnel.items()):
        print(f"  {y}: {c['In scope']:>5,} of {sum(c.values()):,}")
    n = len(scored) or 1
    print("\nOutcome (in scope):")
    for o in OUTCOMES:
        v = summary["outcome"].get(o, 0)
        print(f"  {v:>7,}  {v / n * 100:5.1f}%  {o}   {dict(basis[o])}")
    print("\nOutcome by severity:")
    for s, c in sorted(by_sev.items()):
        print(f"  {s:<16} " + "  ".join(f"{o}: {c.get(o, 0)}" for o in OUTCOMES))
    print("\nTop reasons, truck drivers:")
    for k2, v in reasons["truck"].most_common(6):
        print(f"  {v:>6,}  {k2}")
    print("Top reasons, non-truck drivers:")
    for k2, v in reasons["other"].most_common(6):
        print(f"  {v:>6,}  {k2}")

    g = summary["geometry_view"]
    print(f"\n==== Geometry-only view: {len(geo):,} two-vehicle truck vs non-truck crashes ====")
    print("By year: " + ", ".join(f"{y}: {v:,}" for y, v in g["in_scope_by_year"].items()))
    gn = len(geo) or 1
    for o in OUTCOMES:
        v = g["outcome"].get(o, 0)
        print(f"  {v:>7,}  {v / gn * 100:5.1f}%  {o}")
    print(f"  Undetermined reasons: {g['undetermined_reasons']}")
    print("Outcome by severity:")
    for s_, c in sorted(geo_by_sev.items()):
        print(f"  {s_:<16} " + "  ".join(f"{o}: {c.get(o, 0)}" for o in OUTCOMES))
    print("Agreement on the full-view crashes (full | geometry):")
    for k2, v in agreement.most_common():
        print(f"  {v:>5}  {k2[0]} | {k2[1]}")
    print(f"\nWrote {OUT_DIR}/fault_crashes.csv, fault_summary.json, fault_points.json, fault_points_geometry.json")


if __name__ == "__main__":
    main()
