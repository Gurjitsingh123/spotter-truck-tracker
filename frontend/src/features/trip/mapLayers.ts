import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { formatTime } from '../../core/format';
import { LAYER_SCALES, layerColorStops, RISK_COLORS, RISK_LABELS } from './riskLevels';
import type { TruckStatus } from './tripTimeline';
import type { Checkpoint, Heatmap, HeatmapLayer, TripPlan, TripRoute } from './types';

export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const PROPERTY_PREFIX: Record<HeatmapLayer, string> = { risk: 'r', wind: 'w', rain: 'p', snow: 's' };
const METERS_PER_PIXEL_AT_ZOOM_0 = 78_271.5;

export const riskColor: ExpressionSpecification = [
    'match',
    ['get', 'level'],
    'moderate',
    RISK_COLORS.moderate,
    'high',
    RISK_COLORS.high,
    'severe',
    RISK_COLORS.severe,
    'no_travel',
    RISK_COLORS.no_travel,
    RISK_COLORS.low,
];

export function routesGeoJson(plan: TripPlan): FeatureCollection<LineString> {
    return {
        type: 'FeatureCollection',
        features: plan.routes.flatMap((route) =>
            route.segments.map((segment) => ({
                type: 'Feature' as const,
                properties: { routeId: route.id, level: segment.level },
                geometry: { type: 'LineString' as const, coordinates: segment.coordinates },
            })),
        ),
    };
}

export function checkpointsGeoJson(plan: TripPlan): FeatureCollection<Point> {
    return {
        type: 'FeatureCollection',
        features: plan.routes.flatMap((route) =>
            route.checkpoints.map((checkpoint, index) => ({
                type: 'Feature' as const,
                properties: { routeId: route.id, index, level: checkpoint.risk },
                geometry: { type: 'Point' as const, coordinates: [checkpoint.lon, checkpoint.lat] },
            })),
        ),
    };
}

export function heatmapGeoJson(heatmap: Heatmap): FeatureCollection<Point> {
    return {
        type: 'FeatureCollection',
        features: heatmap.points.map((coordinates, index) => {
            const properties: Record<string, number> = {};
            for (let hour = 0; hour <= heatmap.hours; hour++) {
                properties[`r${hour}`] = heatmap.risk[index][hour] ?? 0;
                properties[`w${hour}`] = heatmap.wind[index][hour] ?? 0;
                properties[`p${hour}`] = heatmap.rain[index][hour] ?? 0;
                properties[`s${hour}`] = heatmap.snow[index][hour] ?? 0;
            }
            return { type: 'Feature', properties, geometry: { type: 'Point', coordinates } };
        }),
    };
}

export function heatColor(layer: HeatmapLayer, hour: number): ExpressionSpecification {
    const value: ExpressionSpecification = ['get', `${PROPERTY_PREFIX[layer]}${hour}`];
    return ['interpolate', ['linear'], value, ...layerColorStops(layer)] as ExpressionSpecification;
}

export function heatOpacity(layer: HeatmapLayer, hour: number): ExpressionSpecification {
    const firstBand = LAYER_SCALES[layer].stops[1];
    return ['case', ['<', ['get', `${PROPERTY_PREFIX[layer]}${hour}`], firstBand], 0.1, 0.42];
}

export function heatRadius(heatmap: Heatmap): ExpressionSpecification {
    const latitudes = heatmap.points.map(([, lat]) => lat);
    const middleLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
    const meters = heatmap.spacing_mi * 1609 * 1.1;
    const pixelsAtZoom0 = meters / (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((middleLat * Math.PI) / 180));
    return ['interpolate', ['exponential', 2], ['zoom'], 0, pixelsAtZoom0, 16, pixelsAtZoom0 * 2 ** 16];
}

export function truckFeature(status: TruckStatus): Feature<Point> {
    return {
        type: 'Feature',
        properties: { level: status.level },
        geometry: { type: 'Point', coordinates: status.position },
    };
}

export function planBounds(plan: TripPlan): [[number, number], [number, number]] {
    const coordinates = plan.routes.flatMap((route) => route.segments.flatMap((segment) => segment.coordinates));
    const lons = coordinates.map(([lon]) => lon);
    const lats = coordinates.map(([, lat]) => lat);
    return [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
    ];
}

const escapeHtml = (text: string) =>
    text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

export function checkpointPopupHtml(route: TripRoute, checkpoint: Checkpoint, index: number): string {
    const { weather } = checkpoint;
    const isEnd = index === route.checkpoints.length - 1;
    const title = index === 0 ? 'Departure' : isEnd ? 'Destination' : `Checkpoint ${index}`;
    const reasons = checkpoint.reasons.length ? checkpoint.reasons.map(escapeHtml).join('<br>') : 'Clear for trucks';

    return `
        <div class="checkpoint-popup">
            <div class="checkpoint-popup__title">${escapeHtml(route.name)} · ${title}</div>
            <div class="checkpoint-popup__meta">Mile ${checkpoint.mile.toFixed(0)} · ETA ${formatTime(checkpoint.eta)}</div>
            <div class="checkpoint-popup__risk" style="background:${RISK_COLORS[checkpoint.risk]}">${RISK_LABELS[checkpoint.risk]}</div>
            <div class="checkpoint-popup__reasons">${reasons}</div>
            <table>
                <tr><td>Wind</td><td>${weather.wind_mph.toFixed(0)} mph (gusts ${weather.gust_mph.toFixed(0)})</td></tr>
                <tr><td>Rain</td><td>${weather.rain_in.toFixed(2)} in/hr</td></tr>
                <tr><td>Snow</td><td>${weather.snow_in.toFixed(2)} in/hr</td></tr>
            </table>
        </div>`;
}
