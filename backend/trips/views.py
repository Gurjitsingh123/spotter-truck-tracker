import logging
import time

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.serializers import TripPlanSerializer
from trips.services.errors import TripPlanningError
from trips.services.planner import heatmap_for_plan, plan_trip

logger = logging.getLogger(__name__)


class TripPlanView(APIView):
    throttle_scope = "trip_plan"

    def post(self, request: Request) -> Response:
        serializer = TripPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        started = time.monotonic()
        try:
            plan = plan_trip(
                origin=data["origin"],
                destination=data["destination"],
                departure=data["departure"],
                load_weight_lb=data["load_weight_lb"],
                interval_mi=data["checkpoint_interval_mi"],
            )
        except TripPlanningError as error:
            logger.warning(
                "trip_plan_failed origin=%r destination=%r reason=%s", data["origin"], data["destination"], error
            )
            return Response({"detail": str(error)}, status=error.status_code)

        logger.info(
            "trip_plan origin=%r destination=%r routes=%s elapsed_ms=%s",
            data["origin"],
            data["destination"],
            len(plan["routes"]),
            int((time.monotonic() - started) * 1000),
        )
        return Response(plan)


class TripHeatmapView(APIView):
    throttle_scope = "trip_heatmap"

    def get(self, request: Request, plan_id: str) -> Response:
        try:
            return Response(heatmap_for_plan(plan_id))
        except TripPlanningError as error:
            return Response({"detail": str(error)}, status=error.status_code)


class HealthView(APIView):
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
