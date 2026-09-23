"""
v2: identifies the commercial unit from vwCommercialUnit membership, because
vwUnit.CommercialVehicleInd is blank for every row in this export.
"""
import csv, os, json
from collections import Counter, defaultdict

BASE = os.path.expanduser("~/Desktop/FMCSA/TITAN Crash Database (Processed)")
CMV = os.path.expanduser("~/Desktop/FMCSA/tn-cmv-dashboard-handoff/data/raw/CMV_crash_database.csv")
OUT = "/private/tmp/claude-501/-Users-manu/be1efb42-bd30-403f-8d38-fa03151d29d1/scratchpad/fault_stats2.json"

ACTION = {
 "01":"Inattentive","02":"Interfered with by passenger","03":"Wrong side of road",
 "04":"Wrong way one-way","05":"License restriction","06":"Failure to keep proper lane",
 "07":"Failure to yield","08":"Failure to obey traffic controls","09":"Failure to observe warnings",
 "10":"Failure to signal","11":"Failure to use lights","12":"Following improperly",
 "13":"Improper backing","14":"Improper lane change","15":"Improper passing","16":"Improper turn",
 "17":"Improper tow/push","18":"Improper hazmat carry","19":"Improper loading",
 "20":"Operator inexperience","21":"No required equipment","22":"Over correcting",
 "23":"Swerved or avoided","24":"Careless erratic driving","25":"Reckless negligent driving",
 "26":"Aggressive driving/road rage","27":"Racing","28":"Exceeding posted speed",
 "29":"Speed too fast for conditions","30":"Speed too slow","31":"Vision obstructed",
 "38":"Driver distraction","39":"Texting distraction","40":"GPS distraction",
 "97":"Driverless","98":"Other","99":"Unknown","00":"None",
}
VIOLCAT = {"00":"None","01":"Alcohol/Drugs","02":"Reckless/Careless","03":"Other Moving",
           "04":"Other Non-Moving","05":"Pending"}
MANNER = {"00":"Not collision w/ MV in transport","01":"Front to Rear","02":"Head-On","03":"Angle",
          "04":"Sideswipe same dir","05":"Sideswipe opp dir","06":"Rear to Side","07":"Rear to Rear",
          "98":"Other","99":"Unknown"}
NEUTRAL = {"00","23","97","98","99",""}

keys, manner_by_key = set(), {}
with open(CMV, newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f):
        k = row["MstrRecNbrTxt"].strip()
        if k:
            keys.add(k); manner_by_key[k] = row.get("MannerCollisionCde","").strip()

def stream(name, cols):
    with open(os.path.join(BASE,name), encoding="utf-8", errors="replace") as f:
        hdr = f.readline().rstrip("\n").split("|")
        idx = {c: hdr.index(c) for c in cols if c in hdr}
        kpos = hdr.index("MstrRecNbrTxt"); n=0
        for line in f:
            p = line.rstrip("\n").split("|")
            if len(p)<=kpos or p[kpos] not in keys: continue
            n+=1
            yield {c:(p[i] if i<len(p) else "") for c,i in idx.items()}
        print(f"  {name}: {n:,} rows", flush=True)

# commercial units, from the commercial-unit table itself
print("vwCommercialUnit...", flush=True)
cmv_unit = defaultdict(set)
for r in stream("vwCommercialUnit.txt", ["MstrRecNbrTxt","UnitIDNmb"]):
    cmv_unit[r["MstrRecNbrTxt"]].add(r["UnitIDNmb"])
print(f"  crashes with an identified commercial unit: {len(cmv_unit):,}", flush=True)

print("vwUnit...", flush=True)
all_units = defaultdict(set)
for r in stream("vwUnit.txt", ["MstrRecNbrTxt","UnitIDNmb"]):
    all_units[r["MstrRecNbrTxt"]].add(r["UnitIDNmb"])

print("vwPerson...", flush=True)
drivers_by_crash = defaultdict(list)
for r in stream("vwPerson.txt", ["MstrRecNbrTxt","UnitIDNmb","PersonIDNmb","PersonTypeCde"]):
    if r.get("PersonTypeCde","").strip()=="01":
        drivers_by_crash[r["MstrRecNbrTxt"]].append(
            (r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"]))

print("vwPersonAction...", flush=True)
actions = defaultdict(set)
for r in stream("vwPersonAction.txt", ["MstrRecNbrTxt","UnitIDNmb","PersonIDNmb","ActionCde"]):
    actions[(r["MstrRecNbrTxt"],r["UnitIDNmb"],r["PersonIDNmb"])].add(r.get("ActionCde","").strip())

print("vwPersonViolation...", flush=True)
violations = defaultdict(set)
for r in stream("vwPersonViolation.txt",
                ["MstrRecNbrTxt","UnitIDNmb","PersonIDNmb","ViolationCategoryCde"]):
    violations[(r["MstrRecNbrTxt"],r["UnitIDNmb"],r["PersonIDNmb"])].add(
        r.get("ViolationCategoryCde","").strip())

# ---- aggregate -------------------------------------------------------------
outcome = Counter(); who = Counter(); who_multi = Counter()
act_cmv = Counter(); act_other = Counter()
agree = Counter(); manner_outcome = defaultdict(Counter)
multi_outcome = Counter()

for k in keys:
    ds = drivers_by_crash.get(k, [])
    nunits = len(all_units.get(k, ()))
    cu = cmv_unit.get(k, set())
    flagged = []
    for d in ds:
        acts = {a for a in actions.get(d,set()) if a not in NEUTRAL}
        viols = {v for v in violations.get(d,set()) if v not in ("","00","05")}
        if acts or viols: flagged.append((d,acts,viols))
        # action-code frequency by party
        tgt = act_cmv if d[1] in cu else act_other
        for a in acts: tgt[ACTION.get(a,a)] += 1
        # do the two independent signals agree on this driver
        if acts and viols: agree["both action and violation"] += 1
        elif acts: agree["action only"] += 1
        elif viols: agree["violation only"] += 1

    if not ds: res = "no driver record"
    elif len(flagged)==0: res = "unattributable (no signal)"
    elif len(flagged)==1: res = "single party flagged"
    else: res = "contested (2+ flagged)"
    outcome[res] += 1

    if nunits >= 2:
        multi_outcome[res] += 1
        if len(flagged)==1:
            d = flagged[0][0]
            who_multi["commercial driver" if d[1] in cu else "other driver"] += 1
        manner_outcome[MANNER.get(manner_by_key.get(k,""), manner_by_key.get(k,""))][res] += 1
    if len(flagged)==1:
        d = flagged[0][0]
        who["commercial driver" if d[1] in cu else "other driver"] += 1

multi_total = sum(multi_outcome.values())
res = {
 "cmv_crashes": len(keys),
 "crashes_with_identified_commercial_unit": len(cmv_unit),
 "outcome_all": dict(outcome),
 "outcome_multi_unit": dict(multi_outcome),
 "multi_unit_total": multi_total,
 "single_flag_party_all": dict(who),
 "single_flag_party_multi_unit": dict(who_multi),
 "driver_signal_mix": dict(agree),
 "top_actions_commercial_driver": dict(act_cmv.most_common(15)),
 "top_actions_other_driver": dict(act_other.most_common(15)),
 "manner_by_outcome": {m: dict(c) for m,c in manner_outcome.items()},
}
json.dump(res, open(OUT,"w"), indent=2)

print("\n================ MULTI-UNIT CRASHES (%d) ================" % multi_total)
for k2,v in multi_outcome.most_common():
    print(f"  {v:>7,}  {v/multi_total*100:5.1f}%  {k2}")
print("\nWhen exactly one party is flagged in a multi-unit crash:")
t = sum(who_multi.values())
for k2,v in who_multi.most_common():
    print(f"  {v:>7,}  {v/t*100:5.1f}%  {k2}")
print("\nTop action codes, COMMERCIAL drivers:")
for k2,v in act_cmv.most_common(10): print(f"  {v:>7,}  {k2}")
print("\nTop action codes, OTHER drivers:")
for k2,v in act_other.most_common(10): print(f"  {v:>7,}  {k2}")
print("\nSignal mix per flagged driver:")
for k2,v in agree.most_common(): print(f"  {v:>7,}  {k2}")
