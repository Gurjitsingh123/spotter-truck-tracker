import { useCallback, useState } from 'react';
import { Alert, Box, LinearProgress, Stack, Typography } from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { formatDateTime } from './core/format';
import HeatmapControls from './features/trip/HeatmapControls';
import RouteCard from './features/trip/RouteCard';
import TripForm from './features/trip/TripForm';
import TripMap from './features/trip/TripMap';
import type { CheckpointFocus, HeatmapLayer } from './features/trip/types';
import { useTripPlan } from './features/trip/useTripPlan';

export default function App() {
    const { plan, heatmap, planning, heatmapLoading, error, heatmapError, submit } = useTripPlan();
    const [picked, setPicked] = useState<{ planId: string; routeId: number } | null>(null);
    const [hour, setHour] = useState(0);
    const [layer, setLayer] = useState<HeatmapLayer>('risk');
    const [focus, setFocus] = useState<CheckpointFocus | null>(null);

    const selectedRouteId = plan ? (picked?.planId === plan.plan_id ? picked.routeId : plan.recommended_route) : null;
    const selectedRoute = plan?.routes.find((route) => route.id === selectedRouteId) ?? null;

    const selectRoute = useCallback(
        (routeId: number) => plan && setPicked({ planId: plan.plan_id, routeId }),
        [plan],
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: '100vh' }}>
            <Box
                component="aside"
                sx={{
                    width: { xs: '100%', md: 400 },
                    height: { xs: 'auto', md: '100%' },
                    overflowY: 'auto',
                    borderRight: { md: 1 },
                    borderColor: { md: 'divider' },
                    bgcolor: 'background.paper',
                    p: 2,
                    flexShrink: 0,
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <LocalShippingIcon color="primary" />
                    <Typography variant="h6" fontWeight={700}>
                        Weather-Aware Truck Routing
                    </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Compare three truck routes by the weather the driver will meet on the way.
                </Typography>

                <TripForm busy={planning} onSubmit={submit} />
                {planning && <LinearProgress sx={{ mt: 2 }} />}
                {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}

                {plan && (
                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            {plan.origin.name} → {plan.destination.name} · departs {formatDateTime(plan.departure)} ·{' '}
                            {plan.load_weight_lb.toLocaleString()} lb
                        </Typography>
                        <Alert severity="success" icon={false}>
                            {plan.recommendation}
                        </Alert>
                        {plan.routes.map((route) => (
                            <RouteCard
                                key={route.id}
                                route={route}
                                selected={route.id === selectedRouteId}
                                onSelect={() => selectRoute(route.id)}
                                onCheckpointClick={(index) => setFocus({ routeId: route.id, index })}
                            />
                        ))}
                        <Typography variant="caption" color="text.secondary">
                            Route colours show the weather at each checkpoint when the truck is expected there. Times
                            are in your local time zone.
                        </Typography>
                    </Stack>
                )}
            </Box>

            <Box component="main" sx={{ position: 'relative', flex: 1, minHeight: { xs: '70vh', md: 0 } }}>
                <TripMap
                    plan={plan}
                    heatmap={heatmap}
                    selectedRouteId={selectedRouteId}
                    hour={Math.min(hour, heatmap?.hours ?? hour)}
                    layer={layer}
                    focus={focus}
                    onSelectRoute={selectRoute}
                />
                {plan && (
                    <Box sx={{ position: 'absolute', left: 16, right: 16, bottom: 24, maxWidth: 820, mx: 'auto' }}>
                        <HeatmapControls
                            heatmap={heatmap}
                            loading={heatmapLoading}
                            error={heatmapError}
                            hour={hour}
                            layer={layer}
                            arrival={selectedRoute?.arrival ?? null}
                            onHourChange={setHour}
                            onLayerChange={setLayer}
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
}
