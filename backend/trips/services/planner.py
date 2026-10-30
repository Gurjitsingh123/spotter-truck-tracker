from __future__ import annotations

import math
import string
from datetime import UTC, datetime
from itertools import pairwise
from uuid import uuid4

from django.core.cache import cache

from trips.services.checkpoints import Checkpoint, place_checkpoints, slice_route
from trips.services.errors import PlanExpiredError, UpstreamError
from trips.services.geo import simplify
from trips.services.geocoding import Place, geocode
from trips.services.heatmap import build_heatmap, corridor_grid
from trips.services.ranking import ScoredRoute, explain_choice, rank_routes, summarize_risk
from trips.services.risk import RiskAssessment, assess
from trips.services.routing import TruckRoute, fetch_truck_routes
from trips.services.weather import Weather, hourly_forecast, weather_at

PLAN_CACHE_SECONDS = 2 * 3600
HEATMAP_CACHE_SECONDS = 30 * 60
MAP_TOLERANCE_MI = 0.05


def plan_trip(*, origin: str, destination: str, departure: datetime, load_weight_lb: int, interval_mi: int) -> dict:
    start_place = geocode(origin)
    end_place = geocode(destination)
    departure = departure.astimezone(UTC)
    routes = fetch_truck_routes(start_place.point, end_place.point, load_weight_lb=load_weight_lb)

    checkpoint_sets = [place_checkpoints(route, interval_mi=interval_mi, departure=departure) for route in routes]
    forecast_start = _hour_floor(departure)
    last_eta = max(checkpoint.eta for checkpoints in checkpoint_sets for checkpoint in checkpoints)
    hours = math.ceil((last_eta - forecast_start).total_seconds() / 3600) + 1
    forecasts = iter(
        hourly_forecast(
            [checkpoint.point for checkpoints in checkpoint_sets for checkpoint in checkpoints],
            start=forecast_start,
            hours=hours,
        )
    )

    scored: list[ScoredRoute] = []
    route_payloads: list[dict] = []
    for index, (route, checkpoints) in enumerate(zip(routes, checkpoint_sets, strict=True)):
        stops = []
        for checkpoint in checkpoints:
            weather = weather_at(next(forecasts), start=forecast_start, when=checkpoint.eta)
            if weather is None:
                raise UpstreamError("The forecast does not cover the whole trip yet. Try an earlier departure.")
            stops.append((checkpoint, weather, assess(weather, load_weight_lb)))

        name = f"Route {string.ascii_uppercase[index]}"
        risk = summarize_risk([checkpoint.mile for checkpoint in checkpoints], [found.level for *_, found in stops])
        scored.append(ScoredRoute(name=name, risk=risk, duration_s=route.duration_s))
        route_payloads.append(_route_payload(index, name, route, stops, departure))

    order = rank_routes(scored)
    for rank, index in enumerate(order, start=1):
        route_payloads[index]["rank"] = rank
        route_payloads[index]["recommended"] = rank == 1
        route_payloads[index]["risk"] = {
            "worst": scored[index].risk.worst.key,
            "average": scored[index].risk.average,
            "miles": {level.key: miles for level, miles in scored[index].risk.miles_by_level.items()},
        }

    plan_id = uuid4().hex
    cache.set(
        f"plan:{plan_id}",
        {
            "lines": [simplify(route.points, 0.5) for route in routes],
            "start": forecast_start,
            "load_weight_lb": load_weight_lb,
        },
        PLAN_CACHE_SECONDS,
    )

    best = scored[order[0]]
    runner_up = scored[order[1]] if len(order) > 1 else None
    return {
        "plan_id": plan_id,
        "origin": _place_payload(start_place),
        "destination": _place_payload(end_place),
        "departure": departure.isoformat(),
        "load_weight_lb": load_weight_lb,
        "interval_mi": interval_mi,
        "recommended_route": order[0],
        "recommendation": explain_choice(best, runner_up),
        "routes": route_payloads,
    }


def heatmap_for_plan(plan_id: str) -> dict:
    if (cached := cache.get(f"heatmap:{plan_id}")) is not None:
        return cached
    plan = cache.get(f"plan:{plan_id}")
    if plan is None:
        raise PlanExpiredError("This trip has expired. Plan it again to load the weather map.")

    grid, spacing_mi = corridor_grid(plan["lines"])
    heatmap = build_heatmap(grid, spacing_mi=spacing_mi, start=plan["start"], load_weight_lb=plan["load_weight_lb"])
    cache.set(f"heatmap:{plan_id}", heatmap, HEATMAP_CACHE_SECONDS)
    return heatmap


def _route_payload(
    index: int,
    name: str,
    route: TruckRoute,
    stops: list[tuple[Checkpoint, Weather, RiskAssessment]],
    departure: datetime,
) -> dict:
    segments = []
    for (start, _, start_risk), (end, _, end_risk) in pairwise(stops):
        line = simplify(slice_route(route, start.mile, end.mile), MAP_TOLERANCE_MI)
        segments.append(
            {
                "level": max(start_risk.level, end_risk.level).key,
                "coordinates": [[round(lon, 5), round(lat, 5)] for lat, lon in line],
            }
        )

    return {
        "id": index,
        "name": name,
        "via": ", ".join(route.roads),
        "distance_mi": round(route.distance_mi, 1),
        "duration_s": round(route.duration_s),
        "arrival": stops[-1][0].eta.isoformat() if stops else departure.isoformat(),
        "checkpoints": [_checkpoint_payload(checkpoint, weather, found) for checkpoint, weather, found in stops],
        "segments": segments,
    }


def _checkpoint_payload(checkpoint: Checkpoint, weather: Weather, found: RiskAssessment) -> dict:
    lat, lon = checkpoint.point
    return {
        "mile": round(checkpoint.mile, 1),
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "eta": checkpoint.eta.isoformat(),
        "risk": found.level.key,
        "reasons": list(found.reasons),
        "weather": {
            "wind_mph": round(weather.wind_mph, 1),
            "gust_mph": round(weather.gust_mph, 1),
            "rain_in": round(weather.rain_in, 2),
            "snow_in": round(weather.snow_in, 2),
        },
    }


def _place_payload(place: Place) -> dict:
    return {"name": place.name, "lat": place.lat, "lon": place.lon}


def _hour_floor(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)
