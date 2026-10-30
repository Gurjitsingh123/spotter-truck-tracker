from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

from trips.services.weather import Weather


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def key(self) -> str:
        return self.name.lower()


# Where two bands share a boundary (0.25 in/hr rain is both "Moderate" and "High" in the table),
# the value goes to the higher band. The top value of each Severe band is still Severe, because
# No Travel starts strictly above it (">1.00", ">3.0") — except wind, where No Travel is "≥55".
WIND_MPH = (25, 35, 45, 55)
RAIN_IN_HR = (0.10, 0.25, 0.50, 1.00)
SNOW_IN_HR = (0.5, 1.0, 2.0, 3.0)

HEAVY_LOAD_LB = 30_000
VERY_HEAVY_LOAD_LB = 40_000


@dataclass(frozen=True)
class RiskAssessment:
    level: RiskLevel
    reasons: tuple[str, ...]


def assess(weather: Weather, load_weight_lb: float) -> RiskAssessment:
    wind = weather.wind_mph
    findings = [
        (_band(wind, WIND_MPH, no_travel_at_limit=True), f"Wind {wind:.0f} mph"),
        (_band(weather.rain_in, RAIN_IN_HR, no_travel_at_limit=False), f"Rain {weather.rain_in:.2f} in/hr"),
        (_band(weather.snow_in, SNOW_IN_HR, no_travel_at_limit=False), f"Snow {weather.snow_in:.2f} in/hr"),
    ]
    if WIND_MPH[2] <= wind < WIND_MPH[3] and load_weight_lb > HEAVY_LOAD_LB:
        findings.append((RiskLevel.NO_TRAVEL, f"Wind {wind:.0f} mph with a {load_weight_lb:,.0f} lb load"))
    elif WIND_MPH[1] <= wind < WIND_MPH[2] and load_weight_lb > VERY_HEAVY_LOAD_LB:
        findings.append((RiskLevel.SEVERE, f"Wind {wind:.0f} mph with a {load_weight_lb:,.0f} lb load"))

    level = max(found for found, _ in findings)
    reasons = tuple(text for found, text in findings if found == level and level > RiskLevel.LOW)
    return RiskAssessment(level=level, reasons=reasons)


def _band(value: float, limits: tuple[float, ...], *, no_travel_at_limit: bool) -> RiskLevel:
    *lower, no_travel = limits
    if value > no_travel or (no_travel_at_limit and value == no_travel):
        return RiskLevel.NO_TRAVEL
    return RiskLevel(sum(value >= limit for limit in lower))
