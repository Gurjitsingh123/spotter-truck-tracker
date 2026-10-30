import type { HeatmapLayer, RiskKey } from './types';

export const RISK_KEYS: RiskKey[] = ['low', 'moderate', 'high', 'severe', 'no_travel'];

export const RISK_LABELS: Record<RiskKey, string> = {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    severe: 'Severe',
    no_travel: 'No Travel',
};

export const RISK_COLORS: Record<RiskKey, string> = {
    low: '#16a34a',
    moderate: '#eab308',
    high: '#f97316',
    severe: '#dc2626',
    no_travel: '#7e22ce',
};

const PALETTE = RISK_KEYS.map((key) => RISK_COLORS[key]);

// Same cut-offs as the backend risk rules, so a colour on the map always means the same band.
export const LAYER_SCALES: Record<HeatmapLayer, { label: string; unit: string; stops: number[] }> = {
    risk: { label: 'Risk', unit: '', stops: [0, 1, 2, 3, 4] },
    wind: { label: 'Wind', unit: 'mph', stops: [0, 25, 35, 45, 55] },
    rain: { label: 'Rain', unit: 'in/hr', stops: [0, 0.1, 0.25, 0.5, 1.0] },
    snow: { label: 'Snow', unit: 'in/hr', stops: [0, 0.5, 1, 2, 3] },
};

export function layerColorStops(layer: HeatmapLayer): (number | string)[] {
    return LAYER_SCALES[layer].stops.flatMap((stop, index) => [stop, PALETTE[index]]);
}

export function legendItems(layer: HeatmapLayer): { color: string; label: string }[] {
    const { stops, unit } = LAYER_SCALES[layer];
    if (layer === 'risk') {
        return RISK_KEYS.map((key) => ({ color: RISK_COLORS[key], label: RISK_LABELS[key] }));
    }
    return stops.map((stop, index) => ({
        color: PALETTE[index],
        label: index === 0 ? `< ${stops[1]}` : `${stop}+ ${index === stops.length - 1 ? unit : ''}`.trim(),
    }));
}
