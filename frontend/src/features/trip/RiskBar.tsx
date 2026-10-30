import { Box, Tooltip } from '@mui/material';
import { formatMiles } from '../../core/format';
import { RISK_COLORS, RISK_KEYS, RISK_LABELS } from './riskLevels';
import type { RiskKey } from './types';

export default function RiskBar({ miles }: { miles: Record<RiskKey, number> }) {
    const total = RISK_KEYS.reduce((sum, key) => sum + miles[key], 0) || 1;

    return (
        <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: 'grey.200' }}>
            {RISK_KEYS.filter((key) => miles[key] > 0).map((key) => (
                <Tooltip key={key} title={`${RISK_LABELS[key]}: ${formatMiles(miles[key])}`}>
                    <Box sx={{ width: `${(miles[key] / total) * 100}%`, bgcolor: RISK_COLORS[key] }} />
                </Tooltip>
            ))}
        </Box>
    );
}
