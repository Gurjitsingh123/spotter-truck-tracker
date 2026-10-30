from datetime import UTC, datetime, timedelta

import pytest

from trips.services.checkpoints import place_checkpoints, slice_route
from trips.services.geo import decode_polyline, simplify
from trips.services.ranking import ScoredRoute, explain_choice, rank_routes, summarize_risk
from trips.services.risk import RiskLevel
from trips.services.routing import TruckRoute

DEPARTURE = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)


def straight_route(miles=100.0, hours=2.0):
    return TruckRoute(
        points=[(0.0, 0.0), (0.0, 1.0)],
        miles=[0.0, miles],
        seconds=[0.0, hours * 3600],
        distance_mi=miles,
        duration_s=hours * 3600,
        roads=("I-35",),
    )


def test_decodes_polyline():
    points = decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", precision=5)

    assert points == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]


def test_simplify_drops_points_on_a_straight_line():
    line = [(0.0, lon / 10) for lon in range(11)]

    assert simplify(line, tolerance_mi=0.1) == [(0.0, 0.0), (0.0, 1.0)]


def test_checkpoints_every_interval_plus_destination():
    checkpoints = place_checkpoints(straight_route(miles=60), interval_mi=25, departure=DEPARTURE)

    assert [checkpoint.mile for checkpoint in checkpoints] == [0, 25, 50, 60]
    assert checkpoints[1].point == pytest.approx((0.0, 25 / 60))


def test_checkpoint_eta_follows_route_timing():
    checkpoints = place_checkpoints(straight_route(miles=100, hours=2), interval_mi=50, departure=DEPARTURE)

    assert [checkpoint.eta for checkpoint in checkpoints] == [
        DEPARTURE,
        DEPARTURE + timedelta(hours=1),
        DEPARTURE + timedelta(hours=2),
    ]


def test_tiny_last_leg_is_merged_into_destination():
    checkpoints = place_checkpoints(straight_route(miles=50.2), interval_mi=25, departure=DEPARTURE)

    assert [checkpoint.mile for checkpoint in checkpoints] == [0, 25, 50.2]


def test_slice_route_keeps_exact_ends():
    piece = slice_route(straight_route(miles=100), 25, 75)

    assert piece[0] == pytest.approx((0.0, 0.25))
    assert piece[-1] == pytest.approx((0.0, 0.75))


def test_stretch_takes_the_worse_end():
    risk = summarize_risk([0, 25, 50], [RiskLevel.LOW, RiskLevel.HIGH, RiskLevel.LOW])

    assert risk.miles_by_level[RiskLevel.HIGH] == 50
    assert risk.miles_by_level[RiskLevel.LOW] == 0
    assert risk.average == 2.0
    assert risk.worst == RiskLevel.HIGH


def scored(name, levels, hours):
    miles = [index * 25 for index in range(len(levels))]
    return ScoredRoute(name=name, risk=summarize_risk(miles, levels), duration_s=hours * 3600)


def test_fewer_severe_miles_beats_faster_route():
    fast_but_severe = scored("Route A", [RiskLevel.LOW, RiskLevel.SEVERE, RiskLevel.LOW], hours=5)
    slow_but_high = scored("Route B", [RiskLevel.HIGH, RiskLevel.HIGH, RiskLevel.HIGH], hours=7)

    assert rank_routes([fast_but_severe, slow_but_high]) == [1, 0]
    assert "fewest Severe-risk miles" in explain_choice(slow_but_high, fast_but_severe)


def test_no_travel_is_worse_than_severe():
    blocked = scored("Route A", [RiskLevel.NO_TRAVEL, RiskLevel.LOW], hours=1)
    severe = scored("Route B", [RiskLevel.SEVERE, RiskLevel.SEVERE, RiskLevel.SEVERE], hours=9)

    assert rank_routes([blocked, severe]) == [1, 0]


def test_travel_time_breaks_a_risk_tie():
    slow = scored("Route A", [RiskLevel.LOW, RiskLevel.MODERATE], hours=6)
    fast = scored("Route B", [RiskLevel.LOW, RiskLevel.MODERATE], hours=5)

    assert rank_routes([slow, fast]) == [1, 0]
    assert explain_choice(fast, slow).endswith("(5 h 00 min vs 6 h 00 min on Route A).")
