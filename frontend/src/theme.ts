import { createTheme } from '@mui/material';

export const theme = createTheme({
    palette: {
        primary: { main: '#0f4c81' },
        success: { main: '#15803d' },
        background: { default: '#f4f6f8' },
    },
    shape: { borderRadius: 8 },
    typography: {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        button: { textTransform: 'none', fontWeight: 600 },
    },
});
