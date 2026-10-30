from __future__ import annotations

import math
from datetime import datetime
from itertools import pairwise

from trips.services.geo import MILES_PER_DEG_LAT, Point, distance_to_line_mi, haversine_mi, simplify
from trips.services.risk import assess
from trips.services.weather import hourly_forecast

FORECAST_HOURS = 48
CORRIDOR_MI = 35
MAX_POINTS = 300
MIN_SPACING_MI = 6


def corridor_grid(
    lines: list[list[Point]], *, buffer_mi: float = CORRIDOR_MI, max_points: int = MAX_POINTS
) -> tuple[list[Point], float]:
    coarse = [simplify(line, 2.0) for line in lines]
    longest = max(sum(haversine_mi(a, b) for a, b in pairwise(line)) for line in coarse)
    spacing = max(MIN_SPACING_MI, math.sqrt(longest * 2 * buffer_mi * 1.5 / max_points))

    grid = _grid(coarse, spacing, buffer_mi)
    while len(grid) > max_points:
        spacing *= 1.15
        grid = _grid(coarse, spacing, buffer_mi)
    return grid, spacing


def build_heatmap(grid: list[Point], *, spacing_mi: float, start: datetime, load_weight_lb: float) -> dict:
    forecasts = hourly_forecast(grid, start=start, hours=FORECAST_HOURS)
    return {
        "start": start.isoformat(),
        "hours": FORECAST_HOURS,
        "spacing_mi": round(spacing_mi, 1),
        "points": [[round(lon, 3), round(lat, 3)] for lat, lon in grid],
        "risk": [[int(assess(hour, load_weight_lb).level) for hour in series] for series in forecasts],
        "wind": [[round(hour.wind_mph) for hour in series] for series in forecasts],
        "rain": [[round(hour.rain_in, 2) for hour in series] for series in forecasts],
        "snow": [[round(hour.snow_in, 2) for hour in series] for series in forecasts],
    }


def _grid(lines: list[list[Point]], spacing_mi: float, buffer_mi: float) -> list[Point]:
    lats = [lat for line in lines for lat, _ in line]
    lons = [lon for line in lines for _, lon in line]
    middle_lat = (min(lats) + max(lats)) / 2
    lat_step = spacing_mi / MILES_PER_DEG_LAT
    lon_step = spacing_mi / (MILES_PER_DEG_LAT * math.cos(math.radians(middle_lat)))
    lat_pad = buffer_mi / MILES_PER_DEG_LAT
    lon_pad = lat_pad * lon_step / lat_step

    grid = []
    lat = min(lats) - lat_pad
    while lat <= max(lats) + lat_pad:
        lon = min(lons) - lon_pad
        while lon <= max(lons) + lon_pad:
            if any(distance_to_line_mi((lat, lon), line) <= buffer_mi for line in lines):
                grid.append((lat, lon))
            lon += lon_step
        lat += lat_step
    return grid
