from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from trips.services import planner
from trips.services.geocoding import Place
from trips.services.routing import TruckRoute
from trips.services.weather import Weather


@pytest.fixture(autouse=True)
def isolated_cache(settings, tmp_path):
    settings.CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.filebased.FileBasedCache", "LOCATION": str(tmp_path)}
    }
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}
    cache.clear()


@pytest.fixture
def stub_services(monkeypatch):
    places = {"Dallas, TX": Place("Dallas, Texas", 32.78, -96.8), "Tulsa, OK": Place("Tulsa, Oklahoma", 36.15, -95.99)}

    def route(miles, hours, lon_bend):
        return TruckRoute(
            points=[(32.78, -96.8), (34.5, lon_bend), (36.15, -95.99)],
            miles=[0.0, miles / 2, miles],
            seconds=[0.0, hours * 1800, hours * 3600],
            distance_mi=miles,
            duration_s=hours * 3600,
            roads=("US-75",),
        )

    def forecast(points, *, start, hours):
        windy = Weather(wind_mph=50, gust_mph=60, rain_in=0, snow_in=0)
        calm = Weather(wind_mph=5, gust_mph=8, rain_in=0, snow_in=0)
        # A windstorm over south-east Oklahoma: the first route bends through it, the second goes west.
        return [[windy if lon > -96.0 and lat < 35.5 else calm] * (hours + 1) for lat, lon in points]

    monkeypatch.setattr(planner, "geocode", places.__getitem__)
    monkeypatch.setattr(planner, "fetch_truck_routes", lambda *_, **__: [route(250, 4, -95.0), route(270, 4.5, -97.5)])
    monkeypatch.setattr(planner, "hourly_forecast", forecast)


def plan_request(**overrides):
    body = {
        "origin": "Dallas, TX",
        "destination": "Tulsa, OK",
        "departure": (timezone.now() + timedelta(hours=1)).isoformat(),
        "load_weight_lb": 35_000,
        "checkpoint_interval_mi": 25,
    }
    return APIClient().post("/api/trips/plan/", {**body, **overrides}, format="json")


def test_plan_recommends_the_route_away_from_the_storm(stub_services):
    response = plan_request()

    assert response.status_code == 200
    plan = response.json()
    assert len(plan["routes"]) == 2
    assert plan["recommended_route"] == 1
    assert plan["routes"][0]["risk"]["worst"] == "no_travel"
    assert plan["routes"][1]["recommended"] is True
    assert "fewest No Travel miles" in plan["recommendation"]


def test_plan_returns_checkpoints_and_map_segments(stub_services):
    route = plan_request(checkpoint_interval_mi=50).json()["routes"][1]

    assert [checkpoint["mile"] for checkpoint in route["checkpoints"]] == [0, 50, 100, 150, 200, 250, 270]
    assert len(route["segments"]) == len(route["checkpoints"]) - 1
    assert route["checkpoints"][-1]["eta"] == route["arrival"]


def test_heatmap_is_served_for_a_planned_trip(stub_services, monkeypatch):
    plan_id = plan_request().json()["plan_id"]
    monkeypatch.setattr("trips.services.heatmap.hourly_forecast", planner.hourly_forecast)

    response = APIClient().get(f"/api/trips/{plan_id}/heatmap/")

    assert response.status_code == 200
    heatmap = response.json()
    assert heatmap["hours"] == 48
    assert len(heatmap["points"]) == len(heatmap["risk"]) > 0
    assert len(heatmap["risk"][0]) == 49


def test_unknown_plan_heatmap_is_not_found():
    assert APIClient().get("/api/trips/missing/heatmap/").status_code == 404


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"departure": "2020-01-01T00:00:00Z"}, "departure"),
        ({"load_weight_lb": 90_000}, "load_weight_lb"),
        ({"checkpoint_interval_mi": 15}, "checkpoint_interval_mi"),
        ({"destination": "dallas, tx"}, "destination"),
    ],
)
def test_plan_rejects_bad_input(overrides, field):
    response = plan_request(**overrides)

    assert response.status_code == 400
    assert field in response.json()
