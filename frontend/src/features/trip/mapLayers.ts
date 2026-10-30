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

// Top-down truck pointing north; the map rotates it to the direction of travel.
const TRUCK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80" viewBox="0 0 20 40">
  <rect x="3.5" y="12" width="13" height="26" rx="1.5" fill="#f8fafc" stroke="#0f172a" stroke-width="1.4"/>
  <line x1="6" y1="17" x2="14" y2="17" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="6" y1="25" x2="14" y2="25" stroke="#94a3b8" stroke-width="0.8"/>
  <line x1="6" y1="33" x2="14" y2="33" stroke="#94a3b8" stroke-width="0.8"/>
  <rect x="8.5" y="9.5" width="3" height="3" fill="#0f172a"/>
  <path d="M4.5 4.5 Q4.5 1.5 7.5 1.5 H12.5 Q15.5 1.5 15.5 4.5 V10 H4.5 Z" fill="#1d4ed8" stroke="#0f172a" stroke-width="1.4"/>
  <rect x="6.3" y="3" width="7.4" height="2.6" rx="0.8" fill="#bfdbfe"/>
</svg>`;

export const TRUCK_ICON = 'truck-top';

export function loadTruckIcon(): Promise<HTMLImageElement> {
    const image = new Image(40, 80);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TRUCK_SVG)}`;
    return image.decode().then(() => image);
}

export function truckFeature(status: TruckStatus): Feature<Point> {
    return {
        type: 'Feature',
        properties: { level: status.level, bearing: status.bearing },
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
