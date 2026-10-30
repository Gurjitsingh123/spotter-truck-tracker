import axios, { isAxiosError } from 'axios';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
    timeout: 60_000,
});

export function errorMessage(error: unknown): string {
    if (!isAxiosError(error)) {
        return 'Something went wrong. Please try again.';
    }
    if (!error.response) {
        return 'Could not reach the server. It may be waking up — try again in a few seconds.';
    }

    const data = error.response.data;
    if (typeof data?.detail === 'string') {
        return data.detail;
    }
    if (data && typeof data === 'object') {
        const first = Object.values(data).flat()[0];
        if (typeof first === 'string') {
            return first;
        }
        if (first && typeof first === 'object') {
            return String(Object.values(first).flat()[0]);
        }
    }
    return `Request failed (${error.response.status}).`;
}
