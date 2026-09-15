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
- [ ] Swap in real TDOT highway geometry
- [x] Push to the GitHub repo + live on Pages
- [ ] Make the map interactive (crash points, county choropleth, etc.)
- [ ] Mode 2: Risk Assessment (needs spec)
- [ ] Mode 3: Predictive Modeling (needs a trained model)
