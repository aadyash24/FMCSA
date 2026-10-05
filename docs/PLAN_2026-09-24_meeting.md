# Implementation plan: 2026-09-24 FMCSA meeting

Source: meeting notes from 2026-09-24 (41 min). Plan written 2026-09-25 against the
current `FMCSA-git` build (commit `fc9ce78`) and the raw extract.

## Dates that drive everything

| When | What |
|---|---|
| Fri 9/25, 11:00 | Zoom with Dr. Shawn (PI). Spring position question. |
| Mon 9/28 | Supervisor delivers fault data (collision + unit + person). |
| Mon 9/28 evening | Send slides to supervisor for review before Tuesday. |
| Tue 9/29 | Professors meeting (remote). They "want to see the dashboard". You present the fault approach. |
| Wed 9/30 | "Show something by end of month". Supervisor's basic fault version. |
| Week of 10/5 | Fall break. |

Priority order for Tuesday: dashboard fixes > Manner tab > slides > Corridor.
Corridor is the item most likely to slip; an interim version is planned below.

## Facts checked against the data (not in the meeting)

- **Indicator fields exist in the crash CSV:** `TowedInd` and `InjuredTransInd`
  (injured person transported, which is the "evacuation IND" the supervisor half-remembered).
  - `TowedInd`: Y 29,282 · N 1,362 · **blank 15,006**
  - `InjuredTransInd`: Y 15,721 · N 21,622 · **blank 8,307**
  - Blank is not "No". The filter needs three states (Yes / No / Not recorded).
- Together with fatal, these two are FMCSA's reportable-crash criteria
  (fatality, injury transported for treatment, vehicle towed). A single
  "FMCSA-reportable only" toggle is the clever add worth making.
- **Route fields in the crash data are too sparse to join on.** Of ~20k interstate
  crashes, 18,009 have a blank `RdwyNbrTxt`. On I-40, 525 of 734 labeled crashes have
  no `MileMarkNmb`. The Corridor join has to be spatial (lat/long), with the route
  number used only as a tiebreaker when present.
- **Road_Geometrics fields** (from the `.shp.xml` metadata): `NBR_TENN_CNTY`,
  `NBR_RTE`, `SPCL_CSE`, `CNTY_SEQ`, `RD_BEG_LOG_MLE`, `RD_END_LOG_MLE`,
  `LOG_MLE_LENGTH`, `SPD_LMT`, `TRUCK_SPD_LMT`, `NBR_LANES`, `ACCESS_CTRL`, `ILLUM`, …
  The route field is `NBR_RTE`. **There is no AADT field**, so traffic volume has to
  come from a separate TDOT layer.
- **We still don't have the geometry.** Only `.shp.xml/.cpg/.prj` are on disk; the
  OneDrive zip holds only the TITAN `vw*.txt` tables. Ask the supervisor for the
  `.shp/.dbf/.shx` today.
- **Fault groundwork already exists** in `docs/fault-method/`: 40,349 multi-unit CMV
  crashes; 74.5% have exactly one driver with a fault signal, 19.8% none, 5.5%
  two or more. The commercial unit is identified through `vwCommercialUnit`
  because `vwUnit.CommercialVehicleInd` is blank everywhere. Reuse this; don't redo it.

---

## Workstream A: data layer refactor (do first, unblocks A1, A2, B)

Today every chart except the year charts reads a pre-aggregated, all-years JSON
(`manner.json`, `weather.json`, …), which is why they ignore the year filter.
Fix it once, at the root: ship one row per crash and aggregate in the browser.

1. `data/prep_crash_data.py`: add a `crashes.json` in column-oriented form
   (arrays per field, codes as small ints plus a `keys` lookup per field):
   `lat, lon, year, severity, manner, weather, light, route, county,
   fatalities, injured, towed, injTrans` (towed/injTrans as 0/1/2 = N/Y/blank).
   45,650 rows at about 2 MB, similar to today's `points.json`. Keep `points.json`
   until `CrashLayer` has moved over, then delete it.
2. `app/src/lib/crashes.ts`: loader plus `filterCrashes(data, filters)` and
   `countBy(rows, field)`. One `Filters` type: `yearRange`, `towed`, `injTrans`,
   `reportableOnly`, `manners[]`, `county | null`.
3. `App.tsx`: filter state moves from `yearRange` alone to `Filters`, shared by the map
   and every mode, the same way the year range is shared now.
4. `CrashLayer.tsx`: take filtered rows instead of `[lat, lon, year, sev]` tuples.

### A1: indicator filters
- Two tri-state controls in `.app-filters`: *Towed* and *Injured transported*
  (Any / Yes / No). Show the "not recorded" count next to each.
- A *FMCSA-reportable only* checkbox: fatal OR towed=Y OR injTrans=Y.
- Confirm with the supervisor that `InjuredTransInd` is the field they meant.

### A2: lower Exploratory charts follow the filter
- Manner, route type, weather, light and county table use `countBy` on the filtered
  rows. Delete the "Full dataset, all years" notes.
- Acceptance: setting 2024–2024 changes every chart, and the numbers match a pandas
  check on the raw CSV for that year.

## Workstream B: Manner of Collision tab

- Add a `"manner"` value to `DashboardMode` and `ModeSelector`. The layout is the
  same as today: map on the left, shared year filter on top.
- **Manner picker**: a checkbox list (multi-select, count beside each, All/None
  buttons). Checkboxes beat a dropdown for 10 items. The selection feeds
  `filters.manners`, so the map follows.
- **Severity bars**: 6 levels ordered least to most severe, PDO-under, PDO,
  Possible, Non-incap, Incap, Fatal, with value labels (Recharts `LabelList`) and the
  existing `severityColors`. "Unknown" is left out of the bars and noted underneath.
- **Summary sentence**: computed from the year filter only, ignoring the manner
  selection: "From {from}–{to}, {X} was the most frequent manner, {Y} caused the
  most injuries and {Z} the most fatalities." Exclude "Unknown" and "Other" from the
  ranking, and say whether "Not a collision with a vehicle in transport" is included.
  Needs `injured` and `fatalities` per crash (already in A).
- **Clever adds** (standing permission): a share-of-fatal-crashes figure per manner
  (fatal ÷ crashes), which shows lethality rather than volume. Head-on will stand out.
- **County click (stretch)**: add a simplified TN counties GeoJSON (Census cartographic
  boundary, about 300 KB), click to set `filters.county`, show a "Focused: Knox ×" chip,
  and have every output respect it. Timebox: 3 hours. If it gets messy, ship without it.

## Workstream C: Corridor Analysis tab

### C0: interim for Tuesday (no TDOT geometry needed)
- Use the placeholder interstate lines already in `tn_highways.geojson`.
- `data/prep_corridors.py` (geopandas + shapely):
  merge each interstate into one line, snap each crash to the nearest line within
  about 100 m, and compute distance along the line (`line.project(point)`) oriented
  west→east (I-40 Memphis→Bristol).
- Output `corridors.json`: per route, crashes in **1-mile bins** stacked by severity.
- Frontend: a `"corridor"` mode, a type-ahead route picker, the route highlighted on
  the map and the others dimmed, the same severity bars, and the linear profile bar chart.
- Label it "Preliminary: approximate geometry" on screen.

### C1: real version (after the shapefile arrives)
1. Load Road_Geometrics and keep interstates and state routes (`NBR_RTE` plus `SPCL_CSE`).
2. **Cumulative milepost**: log miles reset at each county line. Order the county
   pieces of a route by `CNTY_SEQ` (verify it's the along-route order), then
   cumulative = sum of prior counties' lengths + `RD_BEG_LOG_MLE`.
3. **Join**: nearest segment within 30–50 m, **restricted to segments whose route
   matches `RdwyNbrTxt` when that field is filled**. That stops the overpass and
   interchange mis-snaps. Log unmatched crashes and the distance distribution.
4. Outputs: a segment table with crash counts by severity (which the supervisor asked
   for), per-route totals, and a 1-mile-bin profile. Simplify the geometry for the web.
5. **City extents**: intersect the route with Census urban-area polygons and shade the
   bands on the profile x-axis (Memphis, Nashville, Chattanooga, Knoxville). Easier
   than it sounds once cumulative mileposts exist.
6. **Normalization (flag to supervisor)**: raw counts mostly track traffic, so the city
   spikes prove nothing. Request TDOT AADT (the traffic count stations layer). Then show
   crash rate per 100M VMT = crashes ÷ (AADT × length × 365 × years) × 1e8, with a
   raw/rate toggle. Until then, show crashes per mile and label it unnormalized.

## Workstream D: fault method (slides for Tuesday, build later)

### Reframe before Tuesday
Present this as a **rule engine plus an LLM layer, validated against the rule baseline**,
not as an LLM replacing rules. Drop these claims from the pitch; the professors will probe them:
- "Learns from itself / training week": without fine-tuning it's prompt iteration
  and testing. Call it "calibration and stress-testing".
- "RAG confines the model to our rules with no outside bias": false. Constraining
  comes from output schemas plus rule citations, checked in code.
- "Local open models are exactly the same as Claude / offline Claude": false. Say
  "a local open-weight model, benchmarked on our data".
- "Honcho for memory": not needed. Reproducibility comes from temperature 0, a
  pinned model version, cached outputs and an audit log, not from a memory layer.

### Method (merges the supervisor's scorer with the existing evidence-tier proposal)
- **Scope**: 2-unit, truck vs. non-truck crashes. Everything else is labeled
  *Out of scope* (single-vehicle, 3+ units), not silently dropped.
- **Inputs**: the supervisor's 8 variables (maneuver, impact code, road surface,
  alcohol, license status, drugs, action code, violation). All are coded categorical,
  so scoring is a lookup table in code, with weights in a versioned `rules.yaml`.
- **Score upward** (the assistant's idea, which the supervisor accepted): fault points
  per driver F ∈ [0,1].
- **Missing ≠ innocent**: each driver also gets an *evidence completeness* value. Unknown
  alcohol/drug codes add no points but lower completeness, and low completeness pushes the
  outcome toward *Undetermined*. This prevents older years from reading as "not at fault".
- **Outcome states** (thresholds to agree with the supervisor):
  - *Undetermined*: both F < τ (e.g. 0.2) or completeness too low.
  - *Equal*: |F_truck − F_other| < δ (e.g. 0.15).
  - Otherwise *Truck driver* or *Non-truck driver*, with share = F_t ÷ (F_t + F_o).
- **Never use severity as an input** (the outcome follows mass, not fault).
- **LLM jobs, narrow**: (1) draft and critique `rules.yaml` against the reference paper
  (likely Council et al. 2003, TRR 1830; get the PDF); (2) write the per-crash
  plain-English explanation from the rule hits; (3) flag internally contradictory records
  for review. Local model only, because DMV person data is likely barred from cloud APIs
  by the data-use agreement. Confirm that agreement.

### Validation (answers "how do you know it's right?")
- Hand-label a stratified sample of about 200 crashes (supervisor + you, independently),
  report inter-rater κ, then report rule-engine agreement with the consensus.
- Keep citation/violation out of either the inputs or the label, never both (circular).
- Report join retention (collision→unit→person) by year and severity. It is a known bias.
- Benchmark the local model on 1,000 crashes: seconds per crash, and output identical
  across 3 reruns. That turns "2–3 weeks" into evidence.

### Slides (5)
1. **Problem and constraints**: no ground truth, data quality, 74.5 / 19.8 / 5.5 coverage.
2. **Method**: 8-variable rule engine, fault points, 4 outcome states, missing-data rule.
3. **Where AI fits**: rulebook critique, explanations, anomaly flags. Local and reproducible.
4. **Validation and timeline**: 200-crash labeled sample and benchmark.
   Build 1 week, calibrate 1 week, validate 1 week.
5. **Expected output**: a mock of the fault view (severity bucket × {truck / non-truck /
   equal / undetermined} selector, map, summary sentence).

### Build (October, after the supervisor's basic 9/30 version)
`data/fault/` pipeline: join (reuse `fault_analysis2.py` streaming) → `rules.yaml`
scorer → `fault.json` for the dashboard → optional explainer pass cached to disk.
The dashboard's fault mode reuses the Workstream A filter/map plumbing.

---

## Today (Fri 9/25)

- [ ] Before 11:00: a one-paragraph summary for Dr. Shawn (dashboard status, the two new
      tabs, the fault approach framed as above) and the spring-extension question.
- [ ] Ask the supervisor for the Road_Geometrics `.shp/.dbf/.shx`, the AADT layer, the
      reference paper PDF, and confirmation of `InjuredTransInd`.
- [ ] Workstream A + A1 + A2, then deploy.

## Sat–Mon

- [ ] Workstream B (Manner tab). County click only if time remains.
- [ ] C0 interim corridor profile for I-40/I-24/I-75/I-81.
- [ ] Draft the 5 slides; when the data lands Monday, compute the real retention and
      coverage numbers for slide 1.
- [ ] Monday evening: send the slides to the supervisor.

## Open questions for the supervisor
1. Is `InjuredTransInd` the second indicator?
2. Can we get the Road_Geometrics geometry and a TDOT AADT layer?
3. What thresholds for Equal / Undetermined? OK with *Out of scope* for non-2-unit crashes?
4. What does the data-use agreement say about sending person data to a cloud API?
5. Did the client ask for AI, or is that an assumption?
