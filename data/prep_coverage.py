"""
Data coverage for the Overview page: of the CMV crashes, how many vehicles
(unit records) and people (person records) we have, and what share of each
year's crashes has them. Shown so the audience knows the data's limits.

Inputs
  --crashes  the CMV crash extract (default: raw_crash_data.csv at the repo root)
  --input    folder with the TITAN unit/person tables, either the processed
             export (vwUnit.txt, vwPerson.txt) or the 10/5 CSV extract
             (Unit.csv, Person.csv); see data/titan.py

Output  app/public/data/coverage.json

Run from the repo root:
    python3 data/prep_coverage.py --input "~/Desktop/FMCSA Related Crashes"
"""

import argparse
import json
import os
from collections import Counter, defaultdict

from titan import crash_years, table

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CRASHES = os.path.join(HERE, "..", "raw_crash_data.csv")
DEFAULT_INPUT = os.path.expanduser("~/Desktop/FMCSA Related Crashes")
OUT = os.path.join(HERE, "..", "app", "public", "data", "coverage.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crashes", default=DEFAULT_CRASHES)
    ap.add_argument("--input", default=DEFAULT_INPUT)
    args = ap.parse_args()
    folder = os.path.expanduser(args.input)

    years = crash_years(os.path.expanduser(args.crashes))
    keys = set(years)

    vehicles = Counter()  # crash -> unit records
    for r in table(folder, "unit", keys):
        vehicles[r["MstrRecNbrTxt"]] += 1
    people = Counter()  # crash -> person records
    for r in table(folder, "person", keys):
        people[r["MstrRecNbrTxt"]] += 1

    by_year = defaultdict(lambda: {"crashes": 0, "crashesWithVehicles": 0, "vehicles": 0,
                                   "crashesWithPeople": 0, "people": 0})
    for k, y in years.items():
        row = by_year[y or "unknown"]
        row["crashes"] += 1
        row["vehicles"] += vehicles[k]
        row["people"] += people[k]
        row["crashesWithVehicles"] += vehicles[k] > 0
        row["crashesWithPeople"] += people[k] > 0

    rows = [{"year": y, **v} for y, v in sorted(by_year.items()) if y != "unknown"]
    out = {
        "source": f"{os.path.basename(folder.rstrip('/'))} (unit and person tables)",
        "complete": True,
        "crashes": len(years),
        "vehicles": sum(vehicles.values()),
        "people": sum(people.values()),
        "crashesWithVehicles": sum(1 for k in keys if vehicles[k]),
        "crashesWithPeople": sum(1 for k in keys if people[k]),
        "byYear": rows,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)

    print(f"{out['crashes']:,} crashes · {out['vehicles']:,} vehicle records · {out['people']:,} person records")
    print("year   crashes  w/ vehicles  w/ people")
    for r in rows:
        print(f"{r['year']}  {r['crashes']:>8,}  {100 * r['crashesWithVehicles'] / r['crashes']:>10.0f}%"
              f"  {100 * r['crashesWithPeople'] / r['crashes']:>8.0f}%")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
