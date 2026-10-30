from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import astuple, dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from trips.services.errors import UpstreamError
from trips.services.geo import Point
from trips.services.http import call_api

BATCH_SIZE = 100
FORECAST_CACHE_SECONDS = 30 * 60
_FIELDS = ("wind_speed_10m", "wind_gusts_10m", "rain", "snowfall")


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    gust_mph: float
    rain_in: float
    snow_in: float


def hourly_forecast(points: list[Point], *, start: datetime, hours: int) -> list[list[Weather]]:
    batches = [points[i : i + BATCH_SIZE] for i in range(0, len(points), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda batch: _fetch_batch(batch, start=start, hours=hours), batches))
    return [series for batch in results for series in batch]


def weather_at(series: list[Weather], *, start: datetime, when: datetime) -> Weather | None:
    offset = (when - start).total_seconds() / 3600
    index = int(offset)
    if offset < 0 or index >= len(series):
        return None
    if index + 1 == len(series):
        return series[index]
    fraction = offset - index
    before, after = astuple(series[index]), astuple(series[index + 1])
    return Weather(*(a + (b - a) * fraction for a, b in zip(before, after, strict=True)))


def _fetch_batch(points: list[Point], *, start: datetime, hours: int) -> list[list[Weather]]:
    params = {
        "latitude": ",".join(f"{lat:.2f}" for lat, _ in points),
        "longitude": ",".join(f"{lon:.2f}" for _, lon in points),
        "hourly": ",".join(_FIELDS),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": (start + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M"),
    }
    key = "forecast:" + hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    if (cached := cache.get(key)) is not None:
        return cached

    response = call_api("GET", settings.OPEN_METEO_URL, service="The weather service", params=params, timeout=25)
    if not response.ok:
        raise UpstreamError("The weather service could not provide a forecast for this trip. Try an earlier departure.")

    body = response.json()
    locations = body if isinstance(body, list) else [body]
    series = [_parse_hourly(location["hourly"]) for location in locations]
    cache.set(key, series, FORECAST_CACHE_SECONDS)
    return series


def _parse_hourly(hourly: dict) -> list[Weather]:
    columns = [hourly[field] for field in _FIELDS]
    return [Weather(*(float(column[i] or 0) for column in columns)) for i in range(len(hourly["time"]))]
