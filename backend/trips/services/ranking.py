from __future__ import annotations

from dataclasses import dataclass
from itertools import pairwise

from trips.services.risk import RiskLevel


@dataclass(frozen=True)
class RouteRisk:
    miles_by_level: dict[RiskLevel, float]
    average: float
    worst: RiskLevel


@dataclass(frozen=True)
class ScoredRoute:
    name: str
    risk: RouteRisk
    duration_s: float

    @property
    def key(self) -> tuple[float, ...]:
        miles = self.risk.miles_by_level
        return (
            miles[RiskLevel.NO_TRAVEL],
            miles[RiskLevel.SEVERE],
            miles[RiskLevel.HIGH],
            self.risk.average,
            round(self.duration_s / 60),
        )


def summarize_risk(checkpoint_miles: list[float], levels: list[RiskLevel]) -> RouteRisk:
    # A stretch between two checkpoints takes the worse of its two ends: the driver will hit
    # that weather somewhere on the stretch, and over-warning is cheaper than under-warning.
    miles_by_level = dict.fromkeys(RiskLevel, 0.0)
    weighted = 0.0
    for (start, end), (a, b) in zip(pairwise(checkpoint_miles), pairwise(levels), strict=True):
        level = max(a, b)
        miles_by_level[level] += end - start
        weighted += level * (end - start)

    distance = checkpoint_miles[-1] - checkpoint_miles[0]
    return RouteRisk(
        miles_by_level={level: round(miles, 1) for level, miles in miles_by_level.items()},
        average=round(weighted / distance, 2) if distance else float(max(levels)),
        worst=max(levels),
    )


def rank_routes(routes: list[ScoredRoute]) -> list[int]:
    return sorted(range(len(routes)), key=lambda index: routes[index].key)


_REASONS = (
    "it has the fewest No Travel miles",
    "it has the fewest Severe-risk miles",
    "it has the fewest High-risk miles",
    "it has the lowest average weather risk",
    "it is the fastest of the routes with the lowest weather risk",
)


def explain_choice(best: ScoredRoute, runner_up: ScoredRoute | None) -> str:
    if runner_up is None:
        return f"{best.name} is the only truck route found for this trip."
    for position, reason in enumerate(_REASONS):
        mine, theirs = best.key[position], runner_up.key[position]
        if mine < theirs:
            return (
                f"{best.name} is recommended because {reason} "
                f"({_describe(position, mine)} vs {_describe(position, theirs)} on {runner_up.name})."
            )
    return f"{best.name} and {runner_up.name} are tied on weather risk and travel time."


def _describe(position: int, value: float) -> str:
    if position < 3:
        return f"{value:,.0f} mi"
    if position == 3:
        return f"{value:.2f}"
    hours, minutes = divmod(int(value), 60)
    return f"{hours} h {minutes:02d} min"
