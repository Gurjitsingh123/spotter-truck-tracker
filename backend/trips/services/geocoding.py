from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from trips.services.errors import PlaceNotFoundError, UpstreamError
from trips.services.geo import Point
from trips.services.http import call_api

PLACE_CACHE_SECONDS = 7 * 24 * 3600
_COORDINATES = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lon: float

    @property
    def point(self) -> Point:
        return self.lat, self.lon


def geocode(query: str) -> Place:
    if match := _COORDINATES.match(query):
        lat, lon = float(match.group(1)), float(match.group(2))
        return Place(name=f"{lat:.4f}, {lon:.4f}", lat=lat, lon=lon)

    key = "place:" + hashlib.sha256(query.casefold().strip().encode()).hexdigest()
    if (cached := cache.get(key)) is not None:
        return cached

    response = call_api(
        "GET",
        settings.NOMINATIM_URL,
        service="The place search",
        params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1},
        timeout=10,
    )
    if not response.ok:
        raise UpstreamError("The place search is not available right now. Please try again in a minute.")

    results = response.json()
    if not results:
        raise PlaceNotFoundError(f'Could not find "{query}". Try adding the state, for example "Dallas, TX".')

    place = Place(name=_short_name(results[0]), lat=float(results[0]["lat"]), lon=float(results[0]["lon"]))
    cache.set(key, place, PLACE_CACHE_SECONDS)
    return place


def _short_name(result: dict) -> str:
    address = result.get("address", {})
    locality = next(
        (address[part] for part in ("city", "town", "village", "hamlet", "county") if address.get(part)),
        result.get("name"),
    )
    parts = [locality, address.get("state")]
    return ", ".join(part for part in parts if part) or result["display_name"]
