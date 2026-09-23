# TN CMV Crash Dashboard

A dashboard for exploring commercial motor vehicle (CMV) crashes on Tennessee
interstates and state routes. Built as a static site (Vite + React + Leaflet)
deployed to GitHub Pages, with R/Python used offline for data prep.

This is the **skeleton** build from the FMCSA project's task list: a TN map
with highways highlighted, a mode switcher, and Mode 1 (Data Exploration)
fully wired up. Mode 2 (Risk Assessment) and Mode 3 (Predictive Modeling) are
stubbed in as "coming soon" per the task list.

## Status / what's real vs. placeholder

- **Crash data is real.** `app/public/data/*.json` is generated from the
  actual `CMV_crash_database.csv` extract in the FMCSA project (45,650 TN CMV
  crashes, 2015–2025). Code definitions (severity, manner of collision,
  weather, light condition, route type) come from the TITAN crash report data
  dictionary.
- **Highway geometry is a placeholder.** The FMCSA project only had the TDOT
  Road_Geometrics shapefile's *metadata* (`.shp.xml`, `.cpg`, `.prj`) , not
  the actual geometry (`.shp`/`.dbf`/`.shx`) that Chris's R script
  (`docs/Highway_Extraction_in_R.txt`) reads. The map currently uses a public
  substitute (Natural Earth 1:10m roads, clipped to TN) so the skeleton has
  something to show. **Swap this out** once the real shapefile is available,
  see "Replacing the highway layer" below.
- **Live at** https://aadyash24.github.io/FMCSA/ once the first Pages build
  finishes. Every push to `main` redeploys it automatically.

## Project layout

```
FMCSA/
├── app/                    Vite + React + Leaflet site (this is what deploys)
│   ├── src/
│   │   ├── App.tsx          Layout: header, mode tabs, map + mode panel
│   │   ├── components/
│   │   │   ├── TnMap.tsx      Leaflet map, interstate/state-route layers
│   │   │   └── ModeSelector.tsx
│   │   ├── modes/
│   │   │   ├── DataExploration.tsx   Mode 1
│   │   │   └── ComingSoon.tsx        Mode 2 / Mode 3 placeholder
│   │   └── lib/              Shared types + a small fetch hook
│   └── public/data/          Generated JSON/GeoJSON the app fetches at runtime
├── data/
│   ├── prep_crash_data.py    Raw CSV -> app/public/data/*.json
│   ├── prep_highways.py      Raw roads geojson -> app/public/data/tn_highways.geojson
│   └── raw_geo/               Downloaded source data (gitignored, regenerate as needed)
├── .github/workflows/     Pages deploy workflow
├── docs/
│   ├── Highway_Extraction_in_R.txt   Chris's original R script, for reference
│   └── List_of_Tasks.txt             The task list this build is working from
└── raw_crash_data.csv        Raw crash extract (gitignored - large file)
```

## Running it locally

```bash
cd app
npm install
npm run dev       # dev server
npm run build      # production build -> app/dist
npm run preview    # serve the production build locally
```

## Regenerating the data

The JSON/GeoJSON files under `app/public/data/` are generated, not
hand-written. To rebuild them:

```bash
# 1. Crash data (needs raw_crash_data.csv at the repo root)
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r data/requirements.txt
python3 data/prep_crash_data.py

# 2. Highway placeholder (needs data/raw_geo/ne_10m_roads.geojson and
#    data/raw_geo/us_states.geojson - see prep_highways.py for sources)
python3 data/prep_highways.py
```

## Replacing the placeholder highway layer

Once the real `Road_Geometrics.shp` (+ `.dbf`/`.shx`) is available:

1. Run Chris's R script (`docs/Highway_Extraction_in_R.txt`) as-is to
   confirm the extract still looks right.
2. Add an export step at the end, e.g.:
   ```r
   sf::st_write(tn_highways_web, "tn_highways.geojson", driver = "GeoJSON")
   ```
3. Reshape that GeoJSON's properties to match what `TnMap.tsx` expects:
   `route_type` (`"Interstate"` or `"US / State Route"`) and `route_label`
   (e.g. `"I-40"`, `"SR-1"`).
4. Drop the result at `app/public/data/tn_highways.geojson`, replacing the
   placeholder. No app code changes needed, since `TnMap.tsx` already reads this
   file and splits it into the Interstates / State Routes layers.

## Deploying to GitHub Pages

Already wired up. `.github/workflows/deploy.yml` builds `app/` and publishes
`app/dist` to Pages on every push to `main`. Two things make it work, and both
are already committed:

- `base: '/FMCSA/'` in `app/vite.config.ts`, so built asset URLs resolve under
  the repo subpath instead of the domain root.
- Repo Settings > Pages > Source set to **GitHub Actions** (not "Deploy from a
  branch"). This is a one-time click in the GitHub UI.

Watch a deploy under the repo's Actions tab. A blank white page almost always
means the `base` value stopped matching the repo name.

## Roadmap (from the task list)

- [x] Skeleton: TN map with interstates/state routes highlighted
- [x] Mode switcher (Mode 1 active, Mode 2/3 stubbed)
- [x] Mode 1: crash severity, crash type/manner of collision, weather, light
      condition, route type, county breakdown, year-range filter
- [x] Crash points on the map, colored by severity, filterable by year and
      severity, with the year filter shared between the map and the charts
- [ ] Swap in real TDOT highway geometry
- [x] Push to the GitHub repo + live on Pages
- [ ] County choropleth (needs TN county polygons)
- [ ] Mode 2: Risk Assessment (needs spec)
- [ ] Mode 3: Predictive Modeling (needs a trained model)
- [ ] Plausible-fault framework (Collision / Unit / Person / Violation tables)

## Crash points on the map

`data/prep_crash_data.py` writes `app/public/data/points.json`, which holds the
45,438 crashes (of 45,650) that carry usable TN coordinates. The format is
deliberately compact, because a label repeated 45k times is most of the file:

```json
{ "keys": ["Property Damage", "Fatal", ...],
  "points": [[35.9116, -87.7806, 2017, 0], ...] }
```

Each point is `[lat, lon, year, severityIndex]`, where `severityIndex` indexes
into `keys`. That keeps the fetch at about 1.2 MB instead of roughly 2 MB.

`app/src/components/CrashLayer.tsx` draws them. Leaflet will not draw 45k
individual SVG markers at an interactive frame rate, so the layer:

- puts every marker on one shared `L.canvas()` renderer, so a pan repaints a
  single canvas instead of touching 45k DOM nodes;
- builds markers only for points inside the padded viewport;
- thins what is left by a fixed stride when it still exceeds 9,000, so the
  statewide view stays smooth. The stride is deterministic, so the thinned
  view does not shimmer while panning. Zoom in and every point in view is drawn.

The legend, bottom right of the map, toggles severities on and off and reports
what is drawn. It distinguishes the two cases that look alike but are not: a
thinned view ("Showing 7,573 of 45,438 crashes in view, zoom in to see them
all") and a complete one that simply has most crashes off screen ("Showing all
752 crashes in view"). The test is whether a stride was applied, not whether
the drawn count is below the statewide total.

The map fits to a Tennessee bounding box rather than centering on the state.
That needs fractional zoom (`zoomSnap={0.25}`), because TN is wide and short
while the map panel is tall and narrow: at Leaflet's default whole-number
snapping the fit rounds down a level and the state ends up small in the frame.

### Data caveats worth knowing

- Geocoding coverage climbs over time: 97.5 percent of 2015 crashes have usable
  coordinates, versus 100 percent from 2022 on. Early years are slightly
  under-plotted relative to their true counts.
- 2025 is a partial year (1,206 crashes against roughly 5,000 in a full year),
  so the trend charts drop off a cliff at the right edge. That is the extract,
  not the roads.
