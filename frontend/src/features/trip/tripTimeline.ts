import { RISK_KEYS } from './riskLevels';
import type { Checkpoint, Heatmap, RiskKey, TripRoute } from './types';

const HOUR_MS = 3_600_000;
const LOOK_AHEAD_HOURS = 2;

export type TripPhase = 'before' | 'driving' | 'arrived';

export interface TruckStatus {
    phase: TripPhase;
    position: [number, number];
    mile: number;
    level: RiskKey;
    reasons: string[];
}

export interface RiskStretch {
    level: RiskKey;
    fromIndex: number;
    toIndex: number;
    fromMile: number;
    toMile: number;
    start: string;
    end: string;
    reason: string;
}

export interface CorridorSummary {
    riskyShare: number;
    peakWind: number;
    peakRain: number;
    peakSnow: number;
}

const rank = (level: RiskKey) => RISK_KEYS.indexOf(level);
const worse = (a: Checkpoint, b: Checkpoint) => (rank(b.risk) > rank(a.risk) ? b : a);
const etaMs = (checkpoint: Checkpoint) => new Date(checkpoint.eta).getTime();

export function hoursFrom(start: string, when: string): number {
    return (new Date(when).getTime() - new Date(start).getTime()) / HOUR_MS;
}

// Between two checkpoints the truck carries the worse of the two, same as the coloured route segments.
export function truckStatus(route: TripRoute, when: Date): TruckStatus {
    const stops = route.checkpoints;
    const time = when.getTime();
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (time < etaMs(first)) {
        return { phase: 'before', position: [first.lon, first.lat], mile: 0, level: first.risk, reasons: first.reasons };
    }
    for (let i = 1; i < stops.length; i++) {
        const before = stops[i - 1];
        const after = stops[i];
        if (time <= etaMs(after)) {
            const span = etaMs(after) - etaMs(before);
            const fraction = span > 0 ? (time - etaMs(before)) / span : 1;
            const leg = worse(before, after);
            return {
                phase: 'driving',
                position: [
                    before.lon + (after.lon - before.lon) * fraction,
                    before.lat + (after.lat - before.lat) * fraction,
                ],
                mile: before.mile + (after.mile - before.mile) * fraction,
                level: leg.risk,
                reasons: leg.reasons,
            };
        }
    }
    return { phase: 'arrived', position: [last.lon, last.lat], mile: last.mile, level: last.risk, reasons: last.reasons };
}

export function worstAhead(route: TripRoute, when: Date): Checkpoint | null {
    const from = when.getTime();
    const until = from + LOOK_AHEAD_HOURS * HOUR_MS;
    const ahead = route.checkpoints.filter((stop) => etaMs(stop) > from && etaMs(stop) <= until);
    const found = ahead.reduce<Checkpoint | null>((best, stop) => (best ? worse(best, stop) : stop), null);
    return found && found.risk !== 'low' ? found : null;
}

// Runs of checkpoints at Moderate or worse, so the driver sees "mile 260–310, 2–3 PM" instead of single dots.
export function riskStretches(route: TripRoute): RiskStretch[] {
    const stretches: RiskStretch[] = [];
    route.checkpoints.forEach((stop, index) => {
        if (stop.risk === 'low') {
            return;
        }
        const open = stretches[stretches.length - 1];
        if (open && open.toIndex === index - 1) {
            open.toIndex = index;
            open.toMile = stop.mile;
            open.end = stop.eta;
            if (rank(stop.risk) > rank(open.level)) {
                open.level = stop.risk;
                open.reason = stop.reasons[0] ?? '';
            }
            return;
        }
        stretches.push({
            level: stop.risk,
            fromIndex: index,
            toIndex: index,
            fromMile: stop.mile,
            toMile: stop.mile,
            start: stop.eta,
            end: stop.eta,
            reason: stop.reasons[0] ?? '',
        });
    });
    return stretches.sort((a, b) => rank(b.level) - rank(a.level) || a.fromMile - b.fromMile);
}

export function corridorSummary(heatmap: Heatmap, hour: number): CorridorSummary {
    let risky = 0;
    let peakWind = 0;
    let peakRain = 0;
    let peakSnow = 0;
    heatmap.points.forEach((_, index) => {
        if ((heatmap.risk[index][hour] ?? 0) >= 2) {
            risky++;
        }
        peakWind = Math.max(peakWind, heatmap.wind[index][hour] ?? 0);
        peakRain = Math.max(peakRain, heatmap.rain[index][hour] ?? 0);
        peakSnow = Math.max(peakSnow, heatmap.snow[index][hour] ?? 0);
    });
    return { riskyShare: heatmap.points.length ? risky / heatmap.points.length : 0, peakWind, peakRain, peakSnow };
}
