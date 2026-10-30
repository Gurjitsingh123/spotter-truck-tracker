from django.urls import path

from trips.views import HealthView, TripHeatmapView, TripPlanView

urlpatterns = [
    path("health/", HealthView.as_view()),
    path("trips/plan/", TripPlanView.as_view()),
    path("trips/<str:plan_id>/heatmap/", TripHeatmapView.as_view()),
]
