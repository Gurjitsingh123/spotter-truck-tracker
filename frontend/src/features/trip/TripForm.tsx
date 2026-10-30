import { useState, type FormEvent } from 'react';
import {
    Box,
    Button,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { toLocalInputValue } from '../../core/format';
import type { TripInput } from './types';

interface TripFormProps {
    busy: boolean;
    onSubmit: (input: TripInput) => void;
}

function nextFullHour(): Date {
    const date = new Date(Date.now() + 60 * 60_000);
    date.setMinutes(0, 0, 0);
    return date;
}

export default function TripForm({ busy, onSubmit }: TripFormProps) {
    const [origin, setOrigin] = useState('Dallas, TX');
    const [destination, setDestination] = useState('Denver, CO');
    const [departure, setDeparture] = useState(() => toLocalInputValue(nextFullHour()));
    const [loadWeight, setLoadWeight] = useState('38000');
    const [checkpointInterval, setCheckpointInterval] = useState<TripInput['checkpoint_interval_mi']>(25);

    const maxDeparture = toLocalInputValue(new Date(Date.now() + 7 * 24 * 3_600_000));

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        onSubmit({
            origin: origin.trim(),
            destination: destination.trim(),
            departure: new Date(departure).toISOString(),
            load_weight_lb: Number(loadWeight),
            checkpoint_interval_mi: checkpointInterval,
        });
    };

    const swap = () => {
        setOrigin(destination);
        setDestination(origin);
    };

    return (
        <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Stack spacing={1.5} sx={{ flex: 1 }}>
                        <TextField
                            label="Origin"
                            size="small"
                            value={origin}
                            onChange={(event) => setOrigin(event.target.value)}
                            required
                        />
                        <TextField
                            label="Destination"
                            size="small"
                            value={destination}
                            onChange={(event) => setDestination(event.target.value)}
                            required
                        />
                    </Stack>
                    <Tooltip title="Swap origin and destination">
                        <IconButton onClick={swap} size="small">
                            <SwapVertIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>

                <TextField
                    label="Departure"
                    type="datetime-local"
                    size="small"
                    value={departure}
                    onChange={(event) => setDeparture(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: maxDeparture } }}
                    required
                />

                <TextField
                    label="Load weight"
                    type="number"
                    size="small"
                    value={loadWeight}
                    onChange={(event) => setLoadWeight(event.target.value)}
                    slotProps={{
                        input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
                        htmlInput: { min: 0, max: 80000, step: 500 },
                    }}
                    required
                />

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        Check the weather every
                    </Typography>
                    <ToggleButtonGroup
                        value={checkpointInterval}
                        exclusive
                        fullWidth
                        size="small"
                        onChange={(_, value) => value && setCheckpointInterval(value)}
                    >
                        {[10, 25, 50].map((miles) => (
                            <ToggleButton key={miles} value={miles}>
                                {miles} mi
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>

                <Button type="submit" variant="contained" size="large" disabled={busy}>
                    {busy ? 'Checking routes and weather…' : 'Find the safest route'}
                </Button>
            </Stack>
        </Box>
    );
}
