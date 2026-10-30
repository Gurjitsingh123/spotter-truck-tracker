const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

export function formatTime(iso: string | Date): string {
    return timeFormat.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatDateTime(iso: string | Date): string {
    return dateTimeFormat.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

export function formatMiles(miles: number): string {
    return `${Math.round(miles).toLocaleString()} mi`;
}

export function toLocalInputValue(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}
