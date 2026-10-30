from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta

from trips.services.geo import Point, interpolate
from trips.services.routing import TruckRoute

MIN_LAST_LEG_MI = 0.5


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    point: Point
    eta: datetime


def place_checkpoints(route: TruckRoute, *, interval_mi: float, departure: datetime) -> list[Checkpoint]:
    total = route.miles[-1]
    marks = [step * interval_mi for step in range(int(total // interval_mi) + 1)]
    if total - marks[-1] >= MIN_LAST_LEG_MI:
        marks.append(total)
    else:
        marks[-1] = total

    checkpoints = []
    for mark in marks:
        point, seconds = position_at(route, mark)
        checkpoints.append(Checkpoint(mile=mark, point=point, eta=departure + timedelta(seconds=seconds)))
    return checkpoints


def position_at(route: TruckRoute, mile: float) -> tuple[Point, float]:
    index = min(max(bisect_right(route.miles, mile) - 1, 0), len(route.miles) - 2)
    span = route.miles[index + 1] - route.miles[index]
    fraction = min(max((mile - route.miles[index]) / span, 0.0), 1.0) if span else 0.0
    point = interpolate(route.points[index], route.points[index + 1], fraction)
    seconds = route.seconds[index] + (route.seconds[index + 1] - route.seconds[index]) * fraction
    return point, seconds


def slice_route(route: TruckRoute, start_mile: float, end_mile: float) -> list[Point]:
    start, _ = position_at(route, start_mile)
    end, _ = position_at(route, end_mile)
    first = bisect_right(route.miles, start_mile)
    last = bisect_right(route.miles, end_mile)
    return [start, *route.points[first:last], end]
