from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass
from itertools import pairwise

from django.conf import settings

from trips.services.errors import NoRouteError, UpstreamError
from trips.services.geo import Point, decode_polyline, haversine_mi
from trips.services.http import call_api

logger = logging.getLogger(__name__)

ROUTE_COUNT = 3
EMPTY_TRUCK_LB = 35_000
LB_PER_METRIC_TON = 2204.62
DETOUR_OFFSET = 0.18
_HIGHWAY = re.compile(r"^(I|US|SR|[A-Z]{2})[ -]?(\d+[A-Z]?)\b")


@dataclass(frozen=True)
class TruckRoute:
    points: list[Point]
    miles: list[float]
    seconds: list[float]
    distance_mi: float
    duration_s: float
    roads: tuple[str, ...]


def fetch_truck_routes(origin: Point, destination: Point, *, load_weight_lb: float) -> list[TruckRoute]:
    routes = _request_routes([origin, destination], load_weight_lb=load_weight_lb, alternates=ROUTE_COUNT - 1)

    # The router does not always find enough alternatives, so push extra ones through a point
    # off to either side of the main route.
    for via in _detour_points(origin, destination, routes[0]):
        if len(routes) >= ROUTE_COUNT:
            break
        try:
            detour = _request_routes([origin, via, destination], load_weight_lb=load_weight_lb, alternates=0)[0]
        except NoRouteError:
            continue
        if not any(_same_route(detour, route) for route in routes):
            routes.append(detour)

    if len(routes) < ROUTE_COUNT:
        logger.info("only %s routes found between %s and %s", len(routes), origin, destination)
    return routes[:ROUTE_COUNT]


def _request_routes(stops: list[Point], *, load_weight_lb: float, alternates: int) -> list[TruckRoute]:
    payload = {
        "locations": [
            {"lat": lat, "lon": lon, "type": "break" if index in (0, len(stops) - 1) else "through"}
            for index, (lat, lon) in enumerate(stops)
        ],
        "costing": "truck",
        "costing_options": {"truck": {"weight": round((EMPTY_TRUCK_LB + load_weight_lb) / LB_PER_METRIC_TON, 1)}},
        "alternates": alternates,
        "units": "miles",
        "directions_type": "maneuvers",
    }
    response = call_api("POST", settings.VALHALLA_URL, service="The routing service", json=payload, timeout=30)
    if response.status_code == 400:
        raise NoRouteError("No truck route was found between these places. Check that both are reachable by road.")
    if not response.ok:
        raise UpstreamError("The routing service is not available right now. Please try again in a minute.")

    body = response.json()
    trips = [body["trip"], *(alternate["trip"] for alternate in body.get("alternates", []))]
    return [_parse_trip(trip) for trip in trips]


def _parse_trip(trip: dict) -> TruckRoute:
    points: list[Point] = []
    seconds: list[float] = []
    road_miles: Counter[str] = Counter()

    for leg in trip["legs"]:
        shape = decode_polyline(leg["shape"])
        leg_seconds = _vertex_seconds(shape, leg["maneuvers"])
        skip = 1 if points else 0
        elapsed = seconds[-1] if seconds else 0.0
        points.extend(shape[skip:])
        seconds.extend(elapsed + value for value in leg_seconds[skip:])
        for maneuver in leg["maneuvers"]:
            for name in maneuver.get("street_names", []):
                road_miles[_road_name(name)] += maneuver["length"]

    distance_mi = trip["summary"]["length"]
    raw_miles = [0.0]
    for a, b in pairwise(points):
        raw_miles.append(raw_miles[-1] + haversine_mi(a, b))
    scale = distance_mi / raw_miles[-1] if raw_miles[-1] else 1.0

    by_use = [name for name, _ in road_miles.most_common()]
    highways = [name for name in by_use if _HIGHWAY.match(name)]
    return TruckRoute(
        points=points,
        miles=[value * scale for value in raw_miles],
        seconds=seconds,
        distance_mi=distance_mi,
        duration_s=trip["summary"]["time"],
        roads=tuple((highways or by_use)[:2]),
    )


def _vertex_seconds(shape: list[Point], maneuvers: list[dict]) -> list[float]:
    seconds = [0.0] * len(shape)
    elapsed = 0.0
    for maneuver in maneuvers:
        begin, end = maneuver["begin_shape_index"], maneuver["end_shape_index"]
        lengths = [haversine_mi(shape[i], shape[i + 1]) for i in range(begin, end)]
        span = sum(lengths) or 1.0
        covered = 0.0
        for index, length in zip(range(begin + 1, end + 1), lengths, strict=True):
            covered += length
            seconds[index] = elapsed + maneuver["time"] * covered / span
        elapsed += maneuver["time"]
    return seconds


def _road_name(name: str) -> str:
    match = _HIGHWAY.match(name)
    return f"{match.group(1)}-{match.group(2)}" if match else name


def _detour_points(origin: Point, destination: Point, route: TruckRoute) -> list[Point]:
    middle = route.points[len(route.points) // 2]
    d_lat, d_lon = destination[0] - origin[0], destination[1] - origin[1]
    return [(middle[0] + side * d_lon * DETOUR_OFFSET, middle[1] - side * d_lat * DETOUR_OFFSET) for side in (1, -1)]


def _same_route(a: TruckRoute, b: TruckRoute) -> bool:
    close_distance = abs(a.distance_mi - b.distance_mi) < 0.01 * b.distance_mi
    close_duration = abs(a.duration_s - b.duration_s) < 0.01 * b.duration_s
    return close_distance and close_duration
