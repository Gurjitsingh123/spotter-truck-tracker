# Weather-Aware Truck Routing

A React + Django app that helps a truck driver pick the safest of three routes, based on the weather they will
actually drive into, the load they are carrying and how long each route takes.

- **Live app:** _add the Render URL here_
- **Walkthrough:** _add the Loom link here_

## What it does

1. The driver enters origin, destination, departure time, load weight and how often to check the weather
   (every 10, 25 or 50 miles).
2. The API asks a truck router for three routes and drops a checkpoint every N miles along each one.
3. Each checkpoint gets the forecast for the hour the truck is expected to **arrive** there, not the
   departure hour.
4. Every checkpoint is rated Low → No Travel with the risk table and load rules below, and the routes are
   ranked.
5. The map shows all three routes, every checkpoint (click one for ETA, weather and why it got its rating), and
   a weather heatmap over the trip corridor with a 0–48 h slider.

## How it works

| Step | Service | Notes |
|---|---|---|
| Geocoding | [Nominatim](https://nominatim.org/) | `lat,lon` input is also accepted and skips the lookup. |
| Routing | [Valhalla](https://valhalla.github.io/valhalla/) (`truck` costing) | Gross weight (empty tractor-trailer + load) is passed so weight restrictions are respected. Asked for 2 alternates; if it finds fewer, an extra route is forced through a point to either side of the main one. |
| Weather | [Open-Meteo](https://open-meteo.com/) | Hourly wind, gusts, rain and snowfall in mph and in/hr. Up to 100 points per request, fetched in parallel and cached for 30 min. |

**Checkpoint ETAs** come from Valhalla's own per-maneuver travel times spread along the road geometry, so a
slow stretch through a city is reflected in the ETA. The forecast is interpolated between the two hours around
each ETA.

**Risk rules** (from the brief):

| | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind (mph) | < 25 | 25–34 | 35–44 | 45–54 | ≥ 55 |
| Rain (in/hr) | < 0.10 | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

- 45–54 mph wind with a load over 30,000 lb → No Travel
- 35–44 mph wind with a load over 40,000 lb → Severe
- A checkpoint takes the worst of wind, rain, snow and the load rules.

Decisions where the brief leaves room:

- Shared band edges go to the higher band (0.25 in/hr rain is High). The top of each Severe band stays Severe
  because No Travel is written as "> 1.00" / "> 3.0"; for wind it's "≥ 55", so 55 mph is No Travel.
- Wind uses the sustained 10 m wind speed. Gusts are shown but not scored.
- The stretch between two checkpoints takes the **worse** of its two ends. That over-warns a little, which
  seemed the right side to err on for safety.

**Recommendation** sorts routes by No Travel miles, then Severe miles, then High miles, then mile-weighted
average risk (0 = Low … 4 = No Travel), then travel time. No Travel comes first so a route that is closed
somewhere can never be recommended over one that is merely severe. The UI shows which of these criteria
decided it.

**Trip playback.** The panel at the bottom of the map plays the selected route like a replay:

- By default the slider runs from **Depart to Arrive**, so the truck and the slider thumb move together.
  Play advances every animation frame rather than in steps, and **Next 48 h** switches to the full 0–48 h
  forecast.
- The truck follows the road shape of each stretch and turns with it. Its speed on a stretch comes from the
  checkpoint ETAs (i.e. the router's travel times), so it slows down through cities and climbs.
  **Follow truck** keeps the camera on it.
- The headline says where the truck is at that moment ("Route A truck is at mile 410 of 887 mi"), the risk
  it is driving through and why, and the worst thing in the next 2 hours.
- The coloured strip above the slider is the selected route's risk laid out in time, so you can see
  *when* the truck meets bad weather before you press play. The halo around the truck takes the same colour.
- **Watch out on Route X** lists the riskiest stretches (e.g. "High · mi 260–310 · 2:10 PM · Wind 38 mph");
  clicking one jumps the slider to that time and flies the map there.

**Heatmap.** The shading is the forecast for the whole area around the three routes at the slider time, so you
can see a storm moving relative to the truck. After the routes come back, the frontend asks for it separately
so the routes show up without waiting. The API lays a grid over a 35-mile band around all three routes (spacing is
picked so it stays under ~300 points), fetches 48 hours for every point in one go and scores each hour with
the same rules. All 49 hours are loaded into the map once; moving the slider or switching between
Risk / Wind / Rain / Snow only changes a paint expression in MapLibre, so it is instant and never re-downloads.

## Running locally

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python manage.py runserver
```

Frontend (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. No API keys are needed.

Tests and lint:

```bash
cd backend && pytest && ruff check . && ruff format --check .
cd frontend && npm run lint && npm run build
```

## Running on your own server (Docker)

`docker-compose.yml` runs the API (gunicorn) and the site (nginx) on a single port; nginx serves the build and
forwards `/api` to Django, so no CORS setup is needed.

```bash
cp .env.example .env        # set APP_PORT, DJANGO_ALLOWED_HOSTS (server IP/domain) and DJANGO_SECRET_KEY
docker compose up -d --build
```

The app is then on `http://<server>:<APP_PORT>`. Update with `git pull && docker compose up -d --build`.

## Deploying to Render

`render.yaml` defines both services on the free plan.

1. Push the repo to GitHub, then in Render choose **New → Blueprint** and pick the repo.
2. When asked for `VITE_API_URL`, enter `https://<api-service-url>/api` (Render shows the API URL once it is
   created; you can also set it afterwards and redeploy the static site).
3. CORS already allows `truck-routing-web*.onrender.com`. If you rename the static site, update
   `CORS_ALLOWED_ORIGIN_REGEXES` on the API.

The free API instance sleeps when idle, so the first request after a while takes ~30 s to wake it up.

## Project layout

```
backend/
  config/                  Django settings and URLs
  trips/
    services/
      geocoding.py         Nominatim lookup (cached)
      routing.py           Valhalla truck routes + fallback alternates
      checkpoints.py       checkpoints every N miles with ETAs
      weather.py           Open-Meteo batches, interpolation at ETA
      risk.py              risk table + load rules
      ranking.py           per-route risk miles, ranking, explanation
      heatmap.py           corridor grid and 48 h forecast
      planner.py           ties it together for the API
    views.py, serializers.py, urls.py
    tests/
frontend/
  src/
    core/                  axios client, formatting
    features/trip/         form, route cards, map, trip playback
docker-compose.yml
render.yaml
```

## Limitations

- Forecasts get less reliable a few days out, so departure is limited to the next 7 days.
- The public Valhalla and Nominatim servers are rate-limited; for real traffic they should be self-hosted or
  swapped for a paid provider.
- Valhalla's truck speeds are generic; real ETAs depend on hours-of-service breaks, which aren't modelled.
