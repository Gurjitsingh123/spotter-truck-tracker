export type RiskKey = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel';

export type HeatmapLayer = 'risk' | 'wind' | 'rain' | 'snow';

export interface Place {
    name: string;
    lat: number;
    lon: number;
}

export interface CheckpointWeather {
    wind_mph: number;
    gust_mph: number;
    rain_in: number;
    snow_in: number;
}

export interface Checkpoint {
    mile: number;
    lat: number;
    lon: number;
    eta: string;
    risk: RiskKey;
    reasons: string[];
    weather: CheckpointWeather;
}

export interface RouteSegment {
    level: RiskKey;
    coordinates: [number, number][];
}

export interface TripRoute {
    id: number;
    name: string;
    via: string;
    distance_mi: number;
    duration_s: number;
    arrival: string;
    rank: number;
    recommended: boolean;
    risk: {
        worst: RiskKey;
        average: number;
        miles: Record<RiskKey, number>;
    };
    checkpoints: Checkpoint[];
    segments: RouteSegment[];
}

export interface TripPlan {
    plan_id: string;
    origin: Place;
    destination: Place;
    departure: string;
    load_weight_lb: number;
    interval_mi: number;
    recommended_route: number;
    recommendation: string;
    routes: TripRoute[];
}

export interface Heatmap {
    start: string;
    hours: number;
    spacing_mi: number;
    points: [number, number][];
    risk: number[][];
    wind: number[][];
    rain: number[][];
    snow: number[][];
}

export interface TripInput {
    origin: string;
    destination: string;
    departure: string;
    load_weight_lb: number;
    checkpoint_interval_mi: 10 | 25 | 50;
}

export interface CheckpointFocus {
    routeId: number;
    index: number;
}
