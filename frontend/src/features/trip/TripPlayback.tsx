import { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Chip,
    IconButton,
    LinearProgress,
    Paper,
    Slider,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { formatDuration, formatMiles, formatTime } from '../../core/format';
import { LAYER_SCALES, legendItems, RISK_COLORS, RISK_LABELS } from './riskLevels';
import {
    corridorSummary,
    hoursFrom,
    riskStretches,
    worstAhead,
    type RiskStretch,
    type TruckStatus,
} from './tripTimeline';
import type { Heatmap, HeatmapLayer, TripPlan, TripRoute } from './types';

interface TripPlaybackProps {
    plan: TripPlan;
    route: TripRoute | null;
    heatmap: Heatmap | null;
    loading: boolean;
    error: string | null;
    hour: number;
    truck: TruckStatus | null;
    layer: HeatmapLayer;
    onHourChange: (hour: number) => void;
    onLayerChange: (layer: HeatmapLayer) => void;
    onStretchClick: (stretch: RiskStretch) => void;
}

type SliderRange = 'trip' | 'forecast';

// The trip view moves in 15 minute steps so the truck glides along with the slider thumb.
const TRIP_STEP_HOURS = 0.25;
const TRIP_STEP_MS = 120;
const FORECAST_STEP_MS = 450;
const MAX_STRETCHES = 3;

function LevelChip({ level }: { level: TruckStatus['level'] }) {
    return (
        <Chip
            label={RISK_LABELS[level]}
            size="small"
            sx={{ bgcolor: RISK_COLORS[level], color: '#fff', fontWeight: 600, height: 22 }}
        />
    );
}

interface TruckHeadlineProps {
    plan: TripPlan;
    route: TripRoute;
    truck: TruckStatus;
    when: Date;
}

function TruckHeadline({ plan, route, truck, when }: TruckHeadlineProps) {
    if (truck.phase === 'before') {
        return (
            <Typography variant="body2">
                Truck is still in <b>{plan.origin.name}</b>. It leaves at {formatTime(route.checkpoints[0].eta)}.
            </Typography>
        );
    }
    if (truck.phase === 'arrived') {
        return (
            <Typography variant="body2">
                Truck reached <b>{plan.destination.name}</b> at {formatTime(route.arrival)}. The map now shows weather
                it no longer drives through.
            </Typography>
        );
    }

    const ahead = worstAhead(route, when);
    return (
        <Stack spacing={0.25}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2">
                    <b>{route.name}</b> truck is at mile {Math.round(truck.mile)} of {formatMiles(route.distance_mi)}
                </Typography>
                <LevelChip level={truck.level} />
                <Typography variant="body2" color="text.secondary">
                    {truck.reasons.join(', ') || 'Clear for trucks'}
                </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
                {ahead
                    ? `Next 2 h: ${RISK_LABELS[ahead.risk]} at mile ${Math.round(ahead.mile)} around ${formatTime(ahead.eta)} (${ahead.reasons.join(', ')})`
                    : 'Next 2 h: nothing above Low on this route.'}
            </Typography>
        </Stack>
    );
}

interface RouteStripProps {
    route: TripRoute;
    start: string;
    min: number;
    max: number;
}

function RouteStrip({ route, start, min, max }: RouteStripProps) {
    const stops = route.checkpoints;
    const span = max - min || 1;
    return (
        <Box sx={{ position: 'relative', height: 6, borderRadius: 3, bgcolor: 'grey.200', overflow: 'hidden' }}>
            {route.segments.map((segment, index) => {
                const from = Math.max(min, hoursFrom(start, stops[index].eta));
                const to = Math.min(max, hoursFrom(start, stops[index + 1].eta));
                if (to <= from) {
                    return null;
                }
                return (
                    <Box
                        key={index}
                        sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${((from - min) / span) * 100}%`,
                            width: `${((to - from) / span) * 100}%`,
                            bgcolor: RISK_COLORS[segment.level],
                        }}
                    />
                );
            })}
        </Box>
    );
}

export default function TripPlayback({
    plan,
    route,
    heatmap,
    loading,
    error,
    hour,
    truck,
    layer,
    onHourChange,
    onLayerChange,
    onStretchClick,
}: TripPlaybackProps) {
    const [playing, setPlaying] = useState(false);
    const [range, setRange] = useState<SliderRange>('trip');
    const hours = heatmap?.hours ?? 48;
    const start = heatmap?.start ?? plan.departure;

    const departHour = route ? Math.max(0, hoursFrom(start, route.checkpoints[0].eta)) : 0;
    const arriveHour = route ? Math.min(hours, hoursFrom(start, route.arrival)) : hours;
    const followTrip = range === 'trip' && route !== null;
    const min = followTrip ? Math.floor(departHour * 4) / 4 : 0;
    const max = followTrip ? Math.ceil(arriveHour * 4) / 4 : hours;
    const step = followTrip ? TRIP_STEP_HOURS : 1;
    const value = Math.min(max, Math.max(min, hour));

    useEffect(() => {
        if (value !== hour) {
            onHourChange(value);
        }
    }, [value, hour, onHourChange]);

    useEffect(() => {
        if (!playing) {
            return;
        }
        if (value >= max) {
            setPlaying(false);
            return;
        }
        const timer = window.setTimeout(
            () => onHourChange(Math.min(max, value + step)),
            followTrip ? TRIP_STEP_MS : FORECAST_STEP_MS,
        );
        return () => window.clearTimeout(timer);
    }, [playing, value, max, step, followTrip, onHourChange]);

    const togglePlay = () => {
        if (!playing && value >= max) {
            onHourChange(min);
        }
        setPlaying((current) => !current);
    };

    const changeRange = (next: SliderRange) => {
        setPlaying(false);
        setRange(next);
        onHourChange(next === 'trip' ? Math.floor(departHour * 4) / 4 : Math.round(value));
    };

    const when = new Date(new Date(start).getTime() + value * 3_600_000);
    const corridor = heatmap ? corridorSummary(heatmap, Math.round(value)) : null;
    const stretches = route ? riskStretches(route).slice(0, MAX_STRETCHES) : [];
    const sinceDeparture = (value - departHour) * 3600;

    const marks = followTrip
        ? [
              { value: min, label: 'Depart' },
              { value: max, label: 'Arrive' },
          ]
        : [0, 12, 24, 36, 48].map((mark) => ({ value: mark, label: `+${mark}h` }));

    return (
        <Paper elevation={4} sx={{ px: 2, pt: 1.5, pb: 1, borderRadius: 3, width: '100%' }}>
            <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                <Box sx={{ minWidth: 104 }}>
                    <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
                        {formatTime(when)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {sinceDeparture < 0
                            ? 'before departure'
                            : sinceDeparture < 900
                              ? 'leaving now'
                              : `${formatDuration(sinceDeparture)} into the trip`}
                    </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {route && truck ? (
                        <TruckHeadline plan={plan} route={route} truck={truck} when={when} />
                    ) : (
                        <Typography variant="body2">Pick a route to follow the truck.</Typography>
                    )}
                </Box>
            </Stack>

            {loading && (
                <Box sx={{ pt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Loading the 48-hour forecast around the routes…
                    </Typography>
                    <LinearProgress sx={{ mt: 0.5 }} />
                </Box>
            )}
            {error && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                    {error}
                </Alert>
            )}

            {heatmap && (
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
                    <IconButton size="small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play the trip'}>
                        {playing ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>
                    <Box sx={{ flex: 1, px: 1 }}>
                        {route && <RouteStrip route={route} start={start} min={min} max={max} />}
                        <Slider
                            value={value}
                            min={min}
                            max={max}
                            step={step}
                            marks={marks}
                            onChange={(_, value) => onHourChange(value as number)}
                            sx={{ display: 'block', py: '10px', '& .MuiSlider-markLabel': { fontSize: 11 } }}
                        />
                    </Box>
                    <ToggleButtonGroup
                        value={range}
                        exclusive
                        size="small"
                        onChange={(_, next) => next && changeRange(next)}
                    >
                        <ToggleButton value="trip" sx={{ py: 0.25, px: 1, fontSize: 12 }} disabled={!route}>
                            This trip
                        </ToggleButton>
                        <ToggleButton value="forecast" sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                            Next 48 h
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            )}

            {route && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                    <Typography variant="caption" fontWeight={600}>
                        Watch out on {route.name}:
                    </Typography>
                    {stretches.length ? (
                        stretches.map((stretch) => (
                            <Chip
                                key={stretch.fromIndex}
                                size="small"
                                variant="outlined"
                                onClick={() => onStretchClick(stretch)}
                                sx={{ borderColor: RISK_COLORS[stretch.level], borderWidth: 2 }}
                                label={`${RISK_LABELS[stretch.level]} · mi ${Math.round(stretch.fromMile)}–${Math.round(stretch.toMile)} · ${formatTime(stretch.start)} · ${stretch.reason}`}
                            />
                        ))
                    ) : (
                        <Typography variant="caption" color="text.secondary">
                            nothing. Every checkpoint is Low when the truck gets there.
                        </Typography>
                    )}
                </Stack>
            )}

            {heatmap && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}
                >
                    <ToggleButtonGroup
                        value={layer}
                        exclusive
                        size="small"
                        onChange={(_, value) => value && onLayerChange(value)}
                    >
                        {(Object.keys(LAYER_SCALES) as HeatmapLayer[]).map((key) => (
                            <ToggleButton key={key} value={key} sx={{ py: 0.25, px: 1.25 }}>
                                {LAYER_SCALES[key].label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {legendItems(layer).map((item) => (
                            <Stack key={item.label} direction="row" spacing={0.5} alignItems="center">
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
                                <Typography variant="caption">{item.label}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                    {corridor && (
                        <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%' }}>
                            Shading is the forecast at {formatTime(when)} for the area around all three routes:{' '}
                            {Math.round(corridor.riskyShare * 100)}% is High or worse, strongest wind{' '}
                            {Math.round(corridor.peakWind)} mph, heaviest rain {corridor.peakRain.toFixed(2)} in/hr, snow{' '}
                            {corridor.peakSnow.toFixed(1)} in/hr. The bar above the slider shows what the truck itself
                            drives through, hour by hour.
                        </Typography>
                    )}
                </Stack>
            )}
        </Paper>
    );
}
