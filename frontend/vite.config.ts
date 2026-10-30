import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    maplibre: ['maplibre-gl'],
                    mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
                },
            },
        },
        chunkSizeWarningLimit: 1100,
    },
});
