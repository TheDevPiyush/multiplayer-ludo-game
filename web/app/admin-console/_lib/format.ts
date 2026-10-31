/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function ago(iso: string | null | undefined): string {
    if (!iso) return '—';
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return '—';
    const s = Math.round(ms / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d}d ago`;
    return date(iso);
}

export function date(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Board colours (app/components/ludo/geometry.ts). */
export const LUDO_COLOR: Record<string, string> = {
    RED: '#FF3B4E',
    BLUE: '#2E86FF',
    GREEN: '#14C46B',
    YELLOW: '#FFC21A',
};

/** "in 5m", "in 3h", "in 2d" (or "now" once it's past). */
export function fromNow(iso: string | null | undefined): string {
    if (!iso) return '—';
    const ms = Date.parse(iso) - Date.now();
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 30_000) return 'now';
    const m = Math.round(ms / 60_000);
    if (m < 60) return `in ${m}m`;
    const h = Math.round(m / 60);
    if (h < 48) return `in ${h}h`;
    return `in ${Math.round(h / 24)}d`;
}

/** ISO → the value of an <input type="datetime-local"> (local time, to the minute). */
export function toLocalInput(iso: string | Date): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) → ISO, or null if empty / invalid. */
export function fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
