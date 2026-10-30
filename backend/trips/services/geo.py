from __future__ import annotations

import math
from collections.abc import Sequence
from itertools import pairwise

Point = tuple[float, float]

EARTH_RADIUS_MI = 3958.8
MILES_PER_DEG_LAT = 69.0


def haversine_mi(a: Point, b: Point) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def decode_polyline(encoded: str, precision: int = 6) -> list[Point]:
    factor = 10**precision
    points: list[Point] = []
    index = lat = lon = 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        points.append((lat / factor, lon / factor))
    return points


def interpolate(a: Point, b: Point, fraction: float) -> Point:
    return a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction


def segment_distance_mi(p: Point, a: Point, b: Point) -> float:
    scale = math.cos(math.radians(p[0])) * MILES_PER_DEG_LAT
    ax, ay = (a[1] - p[1]) * scale, (a[0] - p[0]) * MILES_PER_DEG_LAT
    bx, by = (b[1] - p[1]) * scale, (b[0] - p[0]) * MILES_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
    return math.hypot(ax + t * dx, ay + t * dy)


def simplify(points: Sequence[Point], tolerance_mi: float) -> list[Point]:
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst, worst_index = 0.0, start
        for i in range(start + 1, end):
            distance = segment_distance_mi(points[i], points[start], points[end])
            if distance > worst:
                worst, worst_index = distance, i
        if worst > tolerance_mi:
            keep[worst_index] = True
            stack.append((start, worst_index))
            stack.append((worst_index, end))
    return [point for point, kept in zip(points, keep, strict=True) if kept]


def distance_to_line_mi(point: Point, line: Sequence[Point]) -> float:
    return min(segment_distance_mi(point, a, b) for a, b in pairwise(line))
