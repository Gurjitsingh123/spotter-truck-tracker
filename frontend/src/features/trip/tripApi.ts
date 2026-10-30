import { api } from '../../core/api';
import type { Heatmap, TripInput, TripPlan } from './types';

export async function planTrip(input: TripInput): Promise<TripPlan> {
    const { data } = await api.post<TripPlan>('/trips/plan/', input);
    return data;
}

export async function fetchHeatmap(planId: string): Promise<Heatmap> {
    const { data } = await api.get<Heatmap>(`/trips/${planId}/heatmap/`);
    return data;
}
