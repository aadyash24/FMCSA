"""
Shared reader for the TITAN unit / person tables, in either format we have:

  * the processed TITAN export, pipe-delimited views (vwUnit.txt, vwPerson.txt, ...)
    e.g. ~/Desktop/FMCSA/TITAN Crash Database (Processed)
  * the supervisor's 10/5 CSV extract (Unit.csv, Person.csv, ...)
    e.g. ~/Desktop/FMCSA Related Crashes

table(folder, "unit") finds whichever file exists and yields dict rows with the
TITAN column names, stripped. Only rows for crash keys in `keys` are yielded,
when keys is given, so the big views stream without loading everything.
"""

import csv
import os

# logical name -> (processed view file, CSV extract file)
FILES = {
    "unit": ("vwUnit.txt", "Unit.csv"),
    "commercial_unit": ("vwCommercialUnit.txt", "CommercialUnit.csv"),
    "person": ("vwPerson.txt", "Person.csv"),
    "person_detail": ("vwPersonDetail.txt", "Person_Detail.csv"),
    "person_action": ("vwPersonAction.txt", "Person_Action.csv"),
    "person_violation": ("vwPersonViolation.txt", "Person_Violation.csv"),
}


def find(folder, name):
    """Path of the table in folder, or None when neither format is there."""
    for fname in FILES[name]:
        path = os.path.join(folder, fname)
        if os.path.exists(path):
            return path
    return None


def table(folder, name, keys=None):
    path = find(folder, name)
    if path is None:
        raise FileNotFoundError(f"No {' or '.join(FILES[name])} in {folder}")
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        if path.endswith(".txt"):
            header = f.readline().rstrip("\r\n").split("|")
            rows = (dict(zip(header, line.rstrip("\r\n").split("|"))) for line in f)
        else:
            rows = csv.DictReader(f)
        for r in rows:
            k = (r.get("MstrRecNbrTxt") or "").strip()
            if not k or (keys is not None and k not in keys):
                continue
            yield {c: (v or "").strip() for c, v in r.items() if c}


def code(value):
    """Normalize a TITAN code: '9' and '09' are the same code, blank stays blank."""
    v = (value or "").strip()
    if v.endswith(".0"):
        v = v[:-2]
    return v.zfill(2) if v.isdigit() else v


def crash_years(crash_csv):
    """{crash key: year} from the CMV crash extract (CMV_crash_database.csv / raw_crash_data.csv)."""
    years = {}
    with open(crash_csv, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            k = (r.get("MstrRecNbrTxt") or "").strip()
            if not k:
                continue
            y = (r.get("Year") or "").strip()
            if y.isdigit():
                years[k] = y
                continue
            d = (r.get("CollisionDte") or "").strip()
            y = d[:4] if d[:4].isdigit() else (d.split(" ")[0].split("/")[-1] if "/" in d else "")
            years[k] = y if y.isdigit() else ""
    return years
