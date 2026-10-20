"""
Static preview for the Contributing Factors tab, from docs/fault-method/fault_stats2.json
(the v2 run over the full processed TITAN export, all years). The tab shows it until
contributing_factors.py has been run and its columns are in crashes.json; it does not
follow the dashboard filters.

Caveat carried into the JSON: fault_stats2 only kept each party's top 15 action codes,
and no citations or alcohol/drug presence, so impairment cannot show up in the preview.

Run from the repo root:
    python3 data/fault/build_factors_preview.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from contributing_factors import BEHAVIORS  # noqa: E402

STATS = os.path.join(HERE, "..", "..", "docs", "fault-method", "fault_stats2.json")
OUT = os.path.join(HERE, "..", "..", "app", "public", "data", "factors_preview.json")

# fault_analysis2.py action labels -> ActionCde
LABEL_CODE = {
    "Inattentive": "01", "Wrong side of road": "03", "Failure to keep proper lane": "06", "Failure to yield": "07",
    "Failure to obey traffic controls": "08", "Failure to observe warnings": "09", "Following improperly": "12",
    "Improper backing": "13", "Improper lane change": "14", "Improper passing": "15", "Improper turn": "16",
    "Operator inexperience": "20", "Over correcting": "22", "Careless erratic driving": "24",
    "Reckless negligent driving": "25", "Exceeding posted speed": "28", "Speed too fast for conditions": "29",
    "Vision obstructed": "31",
}


def group_of(action_code):
    for bit, (label, codes) in enumerate(BEHAVIORS):
        if action_code in codes.get("a", []):
            return bit
    return None


def grouped(actions):
    counts = [0] * len(BEHAVIORS)
    for label, n in actions.items():
        bit = group_of(LABEL_CODE.get(label, ""))
        if bit is not None:
            counts[bit] += n
    return counts


def main():
    with open(STATS) as f:
        s = json.load(f)
    outcome, single = s["outcome_all"], s["single_flag_party_all"]
    out = {
        "source": "Full processed TITAN export, all years (docs/fault-method/fault_stats2.json). Not filtered.",
        "caveat": "Top 15 coded actions per driver type only; citations and alcohol/drug presence not included.",
        "behaviors": [label for label, _ in BEHAVIORS],
        "actionsCmv": grouped(s["top_actions_commercial_driver"]),
        "actionsOther": grouped(s["top_actions_other_driver"]),
        "crashesByParty": {
            "CMV driver only": single["commercial driver"],
            "Other driver only": single["other driver"],
            "Both drivers": outcome["contested (2+ flagged)"],
            "No factor coded": outcome["unattributable (no signal)"],
            "No driver record": outcome["no driver record"],
        },
        "bothNote": "In this preview 'Both drivers' means two or more drivers had a factor coded, whichever vehicles they drove.",
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out["crashesByParty"]), "\nCMV", out["actionsCmv"], "\nOther", out["actionsOther"])


if __name__ == "__main__":
    main()
