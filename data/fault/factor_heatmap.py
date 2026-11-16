"""
Year-by-behavior heatmap of officer-coded driver behaviors in CMV crashes, in
the style of the "Temporal Distribution" slide: one row per behavior group, one
column per year, a count in every cell, shaded in five bins.

Counts can be taken two ways:
  crashes   distinct crashes (MstrRecNbrTxt) where any matching driver had the
            behavior coded: one crash counts once per behavior
  people    distinct drivers (MstrRecNbrTxt + UnitIDNmb + PersonIDNmb) with the
            behavior coded: a crash with two speeding drivers counts twice

Behavior groups and codes come from contributing_factors.py, so the numbers
line up with the Contributing Factors tab. "Other coded action" and "Cited,
other violation" are left out, as in the original slide.

The default input is the 10/5 extract, the same data as the Overview coverage
chart: person records there are sparse before 2023, so most cells before 2023
are 0. Pass the processed export for the full driver records.

Run from the repo root (needs matplotlib):
    python3 data/fault/factor_heatmap.py
    python3 data/fault/factor_heatmap.py --input "~/Desktop/FMCSA/TITAN Crash Database (Processed)"

Options: --who all|cmv|other (default all), --from-csv to replot from the
counts file without rereading the TITAN tables.

Writes data/fault/output/factor_heatmap_<who>.csv and
docs/presentation/factor_heatmap_<who>_{crashes,people}.png.
"""

import argparse
import csv
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from contributing_factors import BEHAVIORS, NEUTRAL_ACTIONS, bit_for  # noqa: E402
from titan import code, crash_years, find, table  # noqa: E402

DEFAULT_CRASHES = os.path.join(HERE, "..", "..", "raw_crash_data.csv")
# Same source as the Overview coverage chart (app/public/data/coverage.json), so the two agree.
DEFAULT_INPUT = os.path.expanduser("~/Desktop/FMCSA Related Crashes")
OUT_DIR = os.path.join(HERE, "output")
FIG_DIR = os.path.join(HERE, "..", "..", "docs", "presentation")

# Rows shown, top to bottom, with the short labels used on the slide.
ROWS = [
    ("Impairment (alcohol / drugs)", "Impairment"),
    ("Lane or position error", "Lane or position errors"),
    ("Following too closely", "Following too closely"),
    ("Failure to yield / obey controls", "Failure to yield / obey controls"),
    ("Reckless / careless driving", "Reckless / careless driving"),
    ("Speeding", "Speeding"),
    ("Improper turn or backing", "Improper turning / backing"),
    ("Distraction / inattention", "Distraction / inattention"),
]
PARTIAL_YEAR = "2025"  # extract ends in March 2025
COLORS = ["#eef0f4", "#dce4f2", "#a9c3df", "#6c8fc7", "#36579a"]  # 0 plus four bins, light to dark


def count(folder, crash_csv, who):
    """{(metric, behavior label, year): n} for metric in crashes / people."""
    years = crash_years(os.path.expanduser(crash_csv))
    keys = set(years)
    lookup = bit_for()

    commercial = defaultdict(set)
    for r in table(folder, "commercial_unit", keys):
        commercial[r["MstrRecNbrTxt"]].add(r["UnitIDNmb"])

    drivers = set()
    for r in table(folder, "person", keys):
        if code(r.get("PersonTypeCde")) != "01":
            continue
        is_cmv = r["UnitIDNmb"] in commercial.get(r["MstrRecNbrTxt"], ())
        if who == "all" or (who == "cmv") == is_cmv:
            drivers.add((r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"]))

    coded = defaultdict(int)  # driver -> behavior bitmask
    for r in table(folder, "person_action", keys):
        a = code(r.get("ActionCde"))
        if a not in NEUTRAL_ACTIONS and ("a", a) in lookup:
            coded[(r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])] |= 1 << lookup[("a", a)]
    for r in table(folder, "person_violation", keys):
        v = code(r.get("ViolationCategoryCde"))
        if ("v", v) in lookup:
            coded[(r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])] |= 1 << lookup[("v", v)]
    if find(folder, "person_detail") is not None:
        for r in table(folder, "person_detail", keys):
            pk = (r["MstrRecNbrTxt"], r["UnitIDNmb"], r["PersonIDNmb"])
            for kind, col in (("alc", "AlcoholPresenceCde"), ("drug", "DrugPresenceCde")):
                if (kind, code(r.get(col))) in lookup:
                    coded[pk] |= 1 << lookup[(kind, code(r.get(col)))]

    labels = [label for label, _ in BEHAVIORS]
    people = defaultdict(int)
    crash_sets = defaultdict(set)
    for pk, mask in coded.items():
        if pk not in drivers:
            continue
        year = years.get(pk[0], "")
        for bit, label in enumerate(labels):
            if mask >> bit & 1:
                people[(label, year)] += 1
                crash_sets[(label, year)].add(pk[0])
    out = {}
    for (label, year), n in people.items():
        out[("people", label, year)] = n
        out[("crashes", label, year)] = len(crash_sets[(label, year)])
    all_years = sorted(y for y in set(years.values()) if y)
    return out, all_years


def write_csv(path, counts, years):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["metric", "behavior", *years])
        for metric in ("crashes", "people"):
            for label, _ in ROWS:
                w.writerow([metric, label, *(counts.get((metric, label, y), 0) for y in years)])


def read_csv(path):
    counts = {}
    with open(path, newline="") as f:
        r = csv.reader(f)
        header = next(r)
        years = header[2:]
        for row in r:
            for y, v in zip(years, row[2:]):
                counts[(row[0], row[1], y)] = int(v)
    return counts, years


def nice_bins(values):
    """Three upper edges for the 1+ cells, round numbers spread over the data (the slide used 10 / 25 / 50)."""
    nonzero = sorted(v for v in values if v > 0)
    if not nonzero:
        return [10, 25, 50]
    steps = [m * 10**e for e in range(0, 7) for m in (1, 2.5, 5)]  # 1, 2.5, 5, 10, 25, 50, ...
    edges = []
    for q in (0.25, 0.5, 0.75):
        v = nonzero[min(len(nonzero) - 1, int(q * len(nonzero)))]
        snapped = min((s for s in steps if s >= 10), key=lambda s: abs(s - v))
        edges.append(int(max(snapped, edges[-1] * 2 if edges else 1)))  # strictly increasing
    return edges


def plot(counts, years, metric, who, path, source):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch, Rectangle

    grid = [[counts.get((metric, label, y), 0) for y in years] for label, _ in ROWS]
    edges = nice_bins([v for row in grid for v in row])

    def shade(v):
        if v == 0:
            return 0
        return 1 + sum(v > e for e in edges)

    n_rows, n_cols = len(ROWS), len(years)
    fig, ax = plt.subplots(figsize=(1.0 * n_cols + 3.4, 0.46 * n_rows + 2.1), dpi=200)
    gap = 0.06
    for i, row in enumerate(grid):
        for j, v in enumerate(row):
            s = shade(v)
            ax.add_patch(Rectangle((j + gap / 2, i + gap / 2), 1 - gap, 1 - gap, color=COLORS[s], lw=0))
            ax.text(j + 0.5, i + 0.5, f"{v:,}", ha="center", va="center", fontsize=9, fontweight="bold",
                    color="white" if s >= 3 else "#1f2937")
    ax.set_xlim(0, n_cols)
    ax.set_ylim(n_rows, 0)
    ax.set_xticks([j + 0.5 for j in range(n_cols)])
    ax.set_xticklabels([f"{y}*" if y == PARTIAL_YEAR else y for y in years], fontweight="bold", fontsize=10)
    ax.xaxis.tick_top()
    ax.set_yticks([i + 0.5 for i in range(n_rows)])
    ax.set_yticklabels([short for _, short in ROWS], fontsize=10)
    ax.tick_params(length=0)
    for side in ax.spines.values():
        side.set_visible(False)

    whose = {"all": "", "cmv": "CMV ", "other": "other "}[who]
    if metric == "crashes":
        caption = f"Identified crashes per behavior and year ({whose or 'any '}driver, counted once per crash)"
    else:
        caption = f"Identified {whose}drivers per behavior and year (counted per person ID)"
    labels = ["0", f"1–{edges[0]:,}", f"{edges[0] + 1:,}–{edges[1]:,}", f"{edges[1] + 1:,}–{edges[2]:,}",
              f"{edges[2] + 1:,}+"]
    fig.text(0.5, 0.11, caption, ha="center", fontsize=11)
    fig.legend(handles=[Patch(color=c, label=l) for c, l in zip(COLORS, labels)], loc="lower center",
               ncol=5, frameon=False, fontsize=9, bbox_to_anchor=(0.5, 0.0), handlelength=1.4)
    fig.text(0.99, 0.005, f"*{PARTIAL_YEAR}: January to March only. Source: {source}, CMV crashes.",
             ha="right", fontsize=7, color="#6b7280")
    fig.subplots_adjust(left=0.24, right=0.99, top=0.88, bottom=0.22)
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crashes", default=DEFAULT_CRASHES)
    ap.add_argument("--input", default=DEFAULT_INPUT)
    ap.add_argument("--who", choices=["all", "cmv", "other"], default="all")
    ap.add_argument("--from-csv", action="store_true", help="replot from the saved counts")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    csv_path = os.path.join(OUT_DIR, f"factor_heatmap_{args.who}.csv")
    if args.from_csv:
        counts, years = read_csv(csv_path)
    else:
        counts, years = count(os.path.expanduser(args.input), args.crashes, args.who)
        write_csv(csv_path, counts, years)
        print(f"Wrote {csv_path}")
    for metric in ("crashes", "people"):
        path = os.path.join(FIG_DIR, f"factor_heatmap_{args.who}_{metric}.png")
        plot(counts, years, metric, args.who, path, os.path.basename(os.path.expanduser(args.input).rstrip("/")))
        print(f"Wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
