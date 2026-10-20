"""
Contributing factors for every CMV crash: which driver behaviors the officer
coded, and whose. Feeds the Contributing Factors tab, which replaces the old
At-Fault tab. Police no longer assign fault; they list the factors for each
driver and leave fault to insurers and courts, so the tab shows factors.

Method (after docs/fault-method/fault_analysis2.py)
  1. Drivers = person records with PersonTypeCde 01. A driver belongs to the
     commercial unit when their unit is in CommercialUnit.
  2. A driver "contributed" when the officer coded at least one non-neutral
     action (ActionCde) or a citation (ViolationCategoryCde 01-04). Alcohol or
     drugs present (Person_Detail, when the table exists) also counts.
  3. Each coded item maps to one behavior group (BEHAVIORS below). Per crash we
     store two bitmasks: groups coded for the CMV driver(s) and for the other
     driver(s).
  4. Contributing party per crash:
        CMV driver only / Other driver only / Both drivers
        No factor coded      drivers on file but nothing coded
        No driver record     no driver person records for the crash

Inputs
  --crashes  the CMV crash extract (default: raw_crash_data.csv at the repo root)
  --input    folder with the TITAN person tables, either the processed export
             (vwPerson.txt, vwPersonAction.txt, ...) or the 10/5 CSV extract
             (Person.csv, Person_Action.csv, ...); see data/titan.py

Outputs
  data/fault/output/factor_crashes.csv   crash_id, party, beh_cmv, beh_other
  app/public/data/factors_meta.json      behavior groups and the codes in each

prep_crash_data.py joins factor_crashes.csv onto crashes.json (columns party,
behCmv, behOther), so the tab follows the shared filters.

Run from the repo root, then rerun prep_crash_data.py:
    python3 data/fault/contributing_factors.py --input "~/Desktop/FMCSA/TITAN Crash Database (Processed)"
"""

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
from titan import code, crash_years, find, table  # noqa: E402

DEFAULT_CRASHES = os.path.join(HERE, "..", "..", "raw_crash_data.csv")
DEFAULT_INPUT = os.path.expanduser("~/Desktop/FMCSA Related Crashes")
OUT_DIR = os.path.join(HERE, "output")
APP_DATA = os.path.join(HERE, "..", "..", "app", "public", "data")

# Behavior groups, in bit order. Codes: ActionCde ("a"), ViolationCategoryCde ("v"),
# alcohol / drug presence ("alc" / "drug", code 01 = present).
BEHAVIORS = [
    ("Speeding", {"a": ["28", "29"]}),
    ("Distraction / inattention", {"a": ["01", "02", "09", "38", "39", "40"]}),
    ("Impairment (alcohol / drugs)", {"v": ["01"], "alc": ["01"], "drug": ["01"]}),
    ("Following too closely", {"a": ["12"]}),
    ("Lane or position error", {"a": ["03", "04", "06", "14", "15", "22"]}),
    ("Failure to yield / obey controls", {"a": ["07", "08", "10"]}),
    ("Reckless / careless driving", {"a": ["24", "25", "26", "27"], "v": ["02"]}),
    ("Improper turn or backing", {"a": ["13", "16"]}),
    ("Other coded action", {"a": ["05", "11", "17", "18", "19", "20", "21", "30", "31"]}),
    ("Cited, other violation", {"v": ["03", "04"]}),
]
NEUTRAL_ACTIONS = {"", "00", "23", "97", "98", "99"}  # none, swerved/avoided, driverless, other, unknown

PARTIES = ["CMV driver only", "Other driver only", "Both drivers", "No factor coded", "No driver record"]


def bit_for():
    lookup = {}
    for bit, (_, codes) in enumerate(BEHAVIORS):
        for kind, values in codes.items():
            for v in values:
                lookup[(kind, v)] = bit
    return lookup


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crashes", default=DEFAULT_CRASHES)
    ap.add_argument("--input", default=DEFAULT_INPUT)
    args = ap.parse_args()
    folder = os.path.expanduser(args.input)

    years = crash_years(os.path.expanduser(args.crashes))
    keys = set(years)
    lookup = bit_for()

    commercial = defaultdict(set)
    for r in table(folder, "commercial_unit", keys):
        commercial[r["MstrRecNbrTxt"]].add(r["UnitIDNmb"])

    drivers = defaultdict(list)  # crash -> [(unit, person)]
    for r in table(folder, "person", keys):
        if code(r.get("PersonTypeCde")) == "01":
            drivers[r["MstrRecNbrTxt"]].append((r["UnitIDNmb"], r["PersonIDNmb"]))

    coded = defaultdict(int)  # (crash, unit, person) -> behavior bitmask
    flagged = set()  # drivers with any contributing item
    for r in table(folder, "person_action", keys):
        a = code(r.get("ActionCde"))
        if a in NEUTRAL_ACTIONS:
            continue
        pk = (r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])
        flagged.add(pk)
        if ("a", a) in lookup:
            coded[pk] |= 1 << lookup[("a", a)]
    for r in table(folder, "person_violation", keys):
        v = code(r.get("ViolationCategoryCde"))
        if ("v", v) not in lookup:
            continue  # 00 none, 05 pending
        pk = (r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])
        flagged.add(pk)
        coded[pk] |= 1 << lookup[("v", v)]
    has_detail = find(folder, "person_detail") is not None
    if has_detail:
        for r in table(folder, "person_detail", keys):
            pk = (r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])
            for kind, col in (("alc", "AlcoholPresenceCde"), ("drug", "DrugPresenceCde")):
                if (kind, code(r.get(col))) in lookup:
                    flagged.add(pk)
                    coded[pk] |= 1 << lookup[(kind, code(r.get(col)))]

    rows = []
    party_count = Counter()
    for k in sorted(keys):
        beh_cmv = beh_other = 0
        cmv_flag = other_flag = False
        for unit, person in drivers.get(k, []):
            pk = (k, unit, person)
            if unit in commercial.get(k, ()):
                beh_cmv |= coded[pk]
                cmv_flag |= pk in flagged
            else:
                beh_other |= coded[pk]
                other_flag |= pk in flagged
        if not drivers.get(k):
            party = "No driver record"
        elif cmv_flag and other_flag:
            party = "Both drivers"
        elif cmv_flag:
            party = "CMV driver only"
        elif other_flag:
            party = "Other driver only"
        else:
            party = "No factor coded"
        party_count[party] += 1
        rows.append({"crash_id": k, "year": years[k], "party": party, "beh_cmv": beh_cmv, "beh_other": beh_other})

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "factor_crashes.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["crash_id", "year", "party", "beh_cmv", "beh_other"])
        w.writeheader()
        w.writerows(rows)

    meta = {
        "source": os.path.basename(folder.rstrip("/")),
        "personDetail": has_detail,
        "parties": PARTIES,
        "behaviors": [{"label": label, "codes": codes} for label, codes in BEHAVIORS],
        "crashesByParty": {p: party_count[p] for p in PARTIES},
        "driverRecordsByYear": dict(sorted(Counter(r["year"] for r in rows if r["party"] != "No driver record").items())),
    }
    with open(os.path.join(APP_DATA, "factors_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    n = len(rows) or 1
    print(f"{len(rows):,} crashes · person detail table: {'yes' if has_detail else 'no (impairment from citations only)'}")
    for p in PARTIES:
        print(f"  {party_count[p]:>7,}  {100 * party_count[p] / n:5.1f}%  {p}")
    for side in ("beh_cmv", "beh_other"):
        c = Counter()
        for r in rows:
            for bit, (label, _) in enumerate(BEHAVIORS):
                if r[side] >> bit & 1:
                    c[label] += 1
        print(f"\nTop behaviors, {'CMV' if side == 'beh_cmv' else 'other'} drivers:")
        for label, v in c.most_common(6):
            print(f"  {v:>7,}  {label}")
    print(f"\nWrote {OUT_DIR}/factor_crashes.csv and app/public/data/factors_meta.json. Now rerun data/prep_crash_data.py.")


if __name__ == "__main__":
    main()
