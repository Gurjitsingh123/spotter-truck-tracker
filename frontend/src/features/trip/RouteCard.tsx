import { useState } from 'react';
import {
    Box,
    Button,
    Chip,
    Collapse,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { formatDuration, formatMiles, formatTime } from '../../core/format';
import RiskBar from './RiskBar';
import { RISK_COLORS, RISK_LABELS } from './riskLevels';
import type { TripRoute } from './types';

interface RouteCardProps {
    route: TripRoute;
    selected: boolean;
    onSelect: () => void;
    onCheckpointClick: (index: number) => void;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <Box>
            <Typography variant="caption" color="text.secondary" display="block">
                {label}
            </Typography>
            <Typography variant="body2" fontWeight={600} color={color}>
                {value}
            </Typography>
        </Box>
    );
}

export default function RouteCard({ route, selected, onSelect, onCheckpointClick }: RouteCardProps) {
    const [showCheckpoints, setShowCheckpoints] = useState(false);
    const { miles } = route.risk;
    const blocked = miles.no_travel > 0;

    return (
        <Paper
            variant="outlined"
            onClick={onSelect}
            sx={{
                p: 1.5,
                cursor: 'pointer',
                borderWidth: 2,
                borderColor: selected ? 'primary.main' : 'divider',
                transition: 'border-color 0.15s',
            }}
        >
            <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" fontWeight={700}>
                    {route.name}
                </Typography>
                {route.recommended && <Chip label="Recommended" color="success" size="small" />}
                {blocked && <Chip label="No Travel stretch" size="small" sx={{ bgcolor: RISK_COLORS.no_travel, color: '#fff' }} />}
                <Box sx={{ flex: 1 }} />
                <Chip
                    label={RISK_LABELS[route.risk.worst]}
                    size="small"
                    sx={{ bgcolor: RISK_COLORS[route.risk.worst], color: '#fff', fontWeight: 600 }}
                />
            </Stack>
            {route.via && (
                <Typography variant="caption" color="text.secondary">
                    via {route.via}
                </Typography>
            )}

            <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 1 }}>
                <Stat label="Distance" value={formatMiles(route.distance_mi)} />
                <Stat label="Drive time" value={formatDuration(route.duration_s)} />
                <Stat label="Arrives" value={formatTime(route.arrival)} />
            </Stack>

            <RiskBar miles={miles} />
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Stat label="Severe" value={formatMiles(miles.severe)} color={miles.severe ? RISK_COLORS.severe : undefined} />
                <Stat label="High" value={formatMiles(miles.high)} color={miles.high ? RISK_COLORS.high : undefined} />
                <Stat label="Avg risk" value={`${route.risk.average.toFixed(2)} / 4`} />
            </Stack>

            <Button
                size="small"
                sx={{ mt: 0.5, px: 0 }}
                onClick={(event) => {
                    event.stopPropagation();
                    setShowCheckpoints((open) => !open);
                }}
            >
                {showCheckpoints ? 'Hide' : 'Show'} {route.checkpoints.length} checkpoints
            </Button>
            <Collapse in={showCheckpoints} unmountOnExit>
                <List dense disablePadding sx={{ maxHeight: 260, overflow: 'auto' }}>
                    {route.checkpoints.map((checkpoint, index) => (
                        <ListItemButton
                            key={checkpoint.mile}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelect();
                                onCheckpointClick(index);
                            }}
                            sx={{ px: 1, borderLeft: 4, borderColor: RISK_COLORS[checkpoint.risk] }}
                        >
                            <ListItemText
                                primary={`Mile ${checkpoint.mile.toFixed(0)} · ${formatTime(checkpoint.eta)}`}
                                secondary={
                                    checkpoint.reasons.join(', ') ||
                                    `Wind ${checkpoint.weather.wind_mph.toFixed(0)} mph, clear for trucks`
                                }
                            />
                            <Typography variant="caption" fontWeight={600} color={RISK_COLORS[checkpoint.risk]}>
                                {RISK_LABELS[checkpoint.risk]}
                            </Typography>
                        </ListItemButton>
                    ))}
                </List>
            </Collapse>
        </Paper>
    );
}
