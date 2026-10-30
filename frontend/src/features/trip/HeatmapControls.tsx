import { useEffect, useState } from 'react';
import {
    Alert,
    Box,
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
import { formatTime } from '../../core/format';
import { LAYER_SCALES, legendItems } from './riskLevels';
import type { Heatmap, HeatmapLayer } from './types';

interface HeatmapControlsProps {
    heatmap: Heatmap | null;
    loading: boolean;
    error: string | null;
    hour: number;
    layer: HeatmapLayer;
    arrival: string | null;
    onHourChange: (hour: number) => void;
    onLayerChange: (layer: HeatmapLayer) => void;
}

const PLAY_STEP_MS = 450;

export default function HeatmapControls({
    heatmap,
    loading,
    error,
    hour,
    layer,
    arrival,
    onHourChange,
    onLayerChange,
}: HeatmapControlsProps) {
    const [playing, setPlaying] = useState(false);
    const hours = heatmap?.hours ?? 48;

    useEffect(() => {
        if (!playing) {
            return;
        }
        const timer = window.setInterval(() => onHourChange(hour >= hours ? 0 : hour + 1), PLAY_STEP_MS);
        return () => window.clearInterval(timer);
    }, [playing, hour, hours, onHourChange]);

    const start = heatmap ? new Date(heatmap.start).getTime() : 0;
    const arrivalHour = heatmap && arrival ? Math.round((new Date(arrival).getTime() - start) / 3_600_000) : null;
    const showArrival = arrivalHour !== null && arrivalHour >= 0 && arrivalHour <= hours;
    const marks = [0, 12, 24, 36, 48]
        .filter((value) => !showArrival || Math.abs(value - arrivalHour) > 4)
        .map((value) => ({ value, label: `+${value}h` }));
    if (showArrival) {
        marks.push({ value: arrivalHour, label: 'Arrive' });
    }

    return (
        <Paper elevation={4} sx={{ px: 2, pt: 1.5, pb: 1, borderRadius: 3, width: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle2">Corridor weather</Typography>
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
                <Box sx={{ flex: 1 }} />
                <Stack direction="row" spacing={1} alignItems="center">
                    {legendItems(layer).map((item) => (
                        <Stack key={item.label} direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
                            <Typography variant="caption">{item.label}</Typography>
                        </Stack>
                    ))}
                </Stack>
            </Stack>

            {loading && (
                <Box sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        Loading the 48-hour forecast along the corridor…
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
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 0.5 }}>
                    <IconButton size="small" onClick={() => setPlaying((value) => !value)} aria-label="Play forecast">
                        {playing ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>
                    <Slider
                        value={hour}
                        min={0}
                        max={hours}
                        step={1}
                        marks={marks}
                        onChange={(_, value) => onHourChange(value as number)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => formatTime(new Date(start + value * 3_600_000))}
                        sx={{ flex: 1, '& .MuiSlider-markLabel': { fontSize: 11 } }}
                    />
                    <Typography variant="body2" fontWeight={600} sx={{ minWidth: 112, textAlign: 'right' }}>
                        {formatTime(new Date(start + hour * 3_600_000))}
                    </Typography>
                </Stack>
            )}
        </Paper>
    );
}
