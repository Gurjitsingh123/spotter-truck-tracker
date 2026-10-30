class TripPlanningError(Exception):
    status_code = 400


class PlaceNotFoundError(TripPlanningError):
    status_code = 400


class NoRouteError(TripPlanningError):
    status_code = 422


class PlanExpiredError(TripPlanningError):
    status_code = 404


class UpstreamError(TripPlanningError):
    status_code = 503
