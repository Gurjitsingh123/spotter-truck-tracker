import pytest

from trips.services.risk import RiskLevel, assess
from trips.services.weather import Weather


def weather(wind=0.0, rain=0.0, snow=0.0):
    return Weather(wind_mph=wind, gust_mph=wind, rain_in=rain, snow_in=snow)


@pytest.mark.parametrize(
    ("wind", "expected"),
    [
        (0, RiskLevel.LOW),
        (24.9, RiskLevel.LOW),
        (25, RiskLevel.MODERATE),
        (34.9, RiskLevel.MODERATE),
        (35, RiskLevel.HIGH),
        (45, RiskLevel.SEVERE),
        (54.9, RiskLevel.SEVERE),
        (55, RiskLevel.NO_TRAVEL),
    ],
)
def test_wind_bands(wind, expected):
    assert assess(weather(wind=wind), load_weight_lb=10_000).level == expected


@pytest.mark.parametrize(
    ("rain", "expected"),
    [
        (0.09, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_rain_bands(rain, expected):
    assert assess(weather(rain=rain), load_weight_lb=10_000).level == expected


@pytest.mark.parametrize(
    ("snow", "expected"),
    [
        (0.4, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.1, RiskLevel.NO_TRAVEL),
    ],
)
def test_snow_bands(snow, expected):
    assert assess(weather(snow=snow), load_weight_lb=10_000).level == expected


def test_strong_wind_with_heavy_load_is_no_travel():
    assert assess(weather(wind=45), load_weight_lb=30_001).level == RiskLevel.NO_TRAVEL
    assert assess(weather(wind=45), load_weight_lb=30_000).level == RiskLevel.SEVERE


def test_high_wind_with_very_heavy_load_is_severe():
    assert assess(weather(wind=40), load_weight_lb=40_001).level == RiskLevel.SEVERE
    assert assess(weather(wind=40), load_weight_lb=40_000).level == RiskLevel.HIGH


def test_worst_condition_wins_and_is_explained():
    result = assess(weather(wind=30, rain=0.6, snow=0.2), load_weight_lb=20_000)

    assert result.level == RiskLevel.SEVERE
    assert result.reasons == ("Rain 0.60 in/hr",)


def test_calm_weather_has_no_reasons():
    assert assess(weather(), load_weight_lb=45_000).reasons == ()
