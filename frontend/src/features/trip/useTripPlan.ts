import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../../core/api';
import { fetchHeatmap, planTrip } from './tripApi';
import type { Heatmap, TripInput, TripPlan } from './types';

export function useTripPlan() {
    const [plan, setPlan] = useState<TripPlan | null>(null);
    const [heatmap, setHeatmap] = useState<Heatmap | null>(null);
    const [planning, setPlanning] = useState(false);
    const [heatmapLoading, setHeatmapLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [heatmapError, setHeatmapError] = useState<string | null>(null);
    const latestRequest = useRef(0);

    const submit = useCallback(async (input: TripInput) => {
        const request = ++latestRequest.current;
        const isLatest = () => request === latestRequest.current;
        setPlanning(true);
        setError(null);

        let result: TripPlan;
        try {
            result = await planTrip(input);
        } catch (err) {
            if (isLatest()) {
                setError(errorMessage(err));
                setPlanning(false);
            }
            return;
        }
        if (!isLatest()) {
            return;
        }

        setPlan(result);
        setHeatmap(null);
        setHeatmapError(null);
        setPlanning(false);
        setHeatmapLoading(true);
        try {
            const corridor = await fetchHeatmap(result.plan_id);
            if (isLatest()) {
                setHeatmap(corridor);
            }
        } catch (err) {
            if (isLatest()) {
                setHeatmapError(errorMessage(err));
            }
        } finally {
            if (isLatest()) {
                setHeatmapLoading(false);
            }
        }
    }, []);

    return { plan, heatmap, planning, heatmapLoading, error, heatmapError, submit };
}
