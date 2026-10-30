import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Typography } from '@mui/material';
import {
    BASEMAP_STYLE,
    checkpointPopupHtml,
    checkpointsGeoJson,
    heatColor,
    heatmapGeoJson,
    heatOpacity,
    heatRadius,
    planBounds,
    riskColor,
    routesGeoJson,
    truckFeature,
} from './mapLayers';
import type { TruckStatus } from './tripTimeline';
import type { CheckpointFocus, Heatmap, HeatmapLayer, TripPlan } from './types';

interface TripMapProps {
    plan: TripPlan | null;
    heatmap: Heatmap | null;
    selectedRouteId: number | null;
    hour: number;
    truck: TruckStatus | null;
    layer: HeatmapLayer;
    focus: CheckpointFocus | null;
    onSelectRoute: (routeId: number) => void;
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export default function TripMap({
    plan,
    heatmap,
    selectedRouteId,
    hour,
    truck,
    layer,
    focus,
    onSelectRoute,
}: TripMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const popupRef = useRef(new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 10 }));
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const planRef = useRef(plan);
    const onSelectRef = useRef(onSelectRoute);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        planRef.current = plan;
        onSelectRef.current = onSelectRoute;
    });

    useEffect(() => {
        const map = new maplibregl.Map({
            container: containerRef.current!,
            style: BASEMAP_STYLE,
            center: [-97, 38.5],
            zoom: 3.8,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
            const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
            for (const id of ['heat', 'routes', 'checkpoints', 'truck']) {
                map.addSource(id, { type: 'geojson', data: EMPTY });
            }

            map.addLayer(
                { id: 'heat', type: 'circle', source: 'heat', paint: { 'circle-blur': 1, 'circle-opacity': 0 } },
                firstLabel,
            );
            map.addLayer({
                id: 'route-casing',
                type: 'line',
                source: 'routes',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#ffffff', 'line-width': 0 },
            });
            map.addLayer({
                id: 'route-lines',
                type: 'line',
                source: 'routes',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#64748b', 'line-width': 4 },
            });
            map.addLayer({
                id: 'checkpoints',
                type: 'circle',
                source: 'checkpoints',
                paint: { 'circle-color': riskColor, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
            });
            map.addLayer({
                id: 'truck-halo',
                type: 'circle',
                source: 'truck',
                paint: { 'circle-radius': 18, 'circle-color': riskColor, 'circle-opacity': 0.35, 'circle-blur': 0.3 },
            });
            map.addLayer({
                id: 'truck',
                type: 'circle',
                source: 'truck',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0f172a',
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 3,
                },
            });

            map.on('click', 'route-lines', (event) => {
                const routeId = event.features?.[0]?.properties?.routeId;
                if (routeId !== undefined) {
                    onSelectRef.current(Number(routeId));
                }
            });
            map.on('click', 'checkpoints', (event) => {
                const properties = event.features?.[0]?.properties;
                const route = planRef.current?.routes.find((item) => item.id === Number(properties?.routeId));
                const checkpoint = route?.checkpoints[Number(properties?.index)];
                if (route && checkpoint) {
                    popupRef.current
                        .setLngLat([checkpoint.lon, checkpoint.lat])
                        .setHTML(checkpointPopupHtml(route, checkpoint, Number(properties?.index)))
                        .addTo(map);
                }
            });
            for (const id of ['route-lines', 'checkpoints']) {
                map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
                map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
            }
            setReady(true);
        });

        mapRef.current = map;
        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) {
            return;
        }
        popupRef.current.remove();
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        (map.getSource('routes') as GeoJSONSource).setData(plan ? routesGeoJson(plan) : EMPTY);
        (map.getSource('checkpoints') as GeoJSONSource).setData(plan ? checkpointsGeoJson(plan) : EMPTY);
        if (!plan) {
            return;
        }

        markersRef.current = [
            new maplibregl.Marker({ color: '#0f172a' }).setLngLat([plan.origin.lon, plan.origin.lat]),
            new maplibregl.Marker({ color: '#2563eb' }).setLngLat([plan.destination.lon, plan.destination.lat]),
        ].map((marker) => marker.addTo(map));
        map.fitBounds(planBounds(plan), { padding: { top: 60, bottom: 300, left: 60, right: 60 }, duration: 900 });
    }, [ready, plan]);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) {
            return;
        }
        const selected = ['==', ['get', 'routeId'], selectedRouteId ?? -1] as maplibregl.ExpressionSpecification;
        map.setLayoutProperty('route-lines', 'line-sort-key', ['case', selected, 1, 0]);
        map.setPaintProperty('route-lines', 'line-color', ['case', selected, riskColor, '#64748b']);
        map.setPaintProperty('route-lines', 'line-width', ['case', selected, 6, 4]);
        map.setPaintProperty('route-lines', 'line-opacity', ['case', selected, 1, 0.5]);
        map.setPaintProperty('route-casing', 'line-width', ['case', selected, 10, 0]);
        map.setPaintProperty('checkpoints', 'circle-radius', ['case', selected, 5.5, 3]);
        map.setPaintProperty('checkpoints', 'circle-opacity', ['case', selected, 1, 0.45]);
        map.setPaintProperty('checkpoints', 'circle-stroke-opacity', ['case', selected, 1, 0.45]);
    }, [ready, selectedRouteId]);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) {
            return;
        }
        (map.getSource('heat') as GeoJSONSource).setData(heatmap ? heatmapGeoJson(heatmap) : EMPTY);
        if (heatmap) {
            map.setPaintProperty('heat', 'circle-radius', heatRadius(heatmap));
        }
    }, [ready, heatmap]);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map || !heatmap) {
            return;
        }
        map.setPaintProperty('heat', 'circle-color', heatColor(layer, hour));
        map.setPaintProperty('heat', 'circle-opacity', heatOpacity(layer, hour));
    }, [ready, heatmap, layer, hour]);

    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) {
            return;
        }
        (map.getSource('truck') as GeoJSONSource).setData(
            truck ? { type: 'FeatureCollection', features: [truckFeature(truck)] } : EMPTY,
        );
    }, [ready, truck]);

    useEffect(() => {
        const map = mapRef.current;
        const route = planRef.current?.routes.find((item) => item.id === focus?.routeId);
        const checkpoint = focus ? route?.checkpoints[focus.index] : undefined;
        if (!map || !route || !checkpoint || !focus) {
            return;
        }
        map.flyTo({ center: [checkpoint.lon, checkpoint.lat], zoom: Math.max(map.getZoom(), 8), duration: 800 });
        popupRef.current
            .setLngLat([checkpoint.lon, checkpoint.lat])
            .setHTML(checkpointPopupHtml(route, checkpoint, focus.index))
            .addTo(map);
    }, [focus]);

    return (
        <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
            <Box ref={containerRef} sx={{ position: 'absolute', inset: 0 }} />
            {!plan && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bgcolor: 'background.paper',
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        boxShadow: 2,
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        Plan a trip to see routes and the weather along them.
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
