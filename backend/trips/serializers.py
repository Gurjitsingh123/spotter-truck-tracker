from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

MAX_DAYS_AHEAD = 7


class TripPlanSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=80_000)
    checkpoint_interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate_departure(self, value):
        now = timezone.now()
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Departure can't be in the past.")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(
                f"Pick a departure within the next {MAX_DAYS_AHEAD} days so the forecast covers the trip."
            )
        return value

    def validate(self, attrs):
        if attrs["origin"].strip().casefold() == attrs["destination"].strip().casefold():
            raise serializers.ValidationError({"destination": "Destination must be different from the origin."})
        return attrs
