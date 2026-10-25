// One HTTP client for every API call: base URL, auth header, JSON, errors and a timeout.

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; status?: number };
export type Result<T> = Ok<T> | Fail;

/** Long enough for a cold server, short enough that a dead connection doesn't spin forever. */
const DEFAULT_TIMEOUT_MS = 10_000;

export function apiBaseUrl(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

function parseError(body: unknown, fallback: string): string {
    if (typeof body === 'object' && body !== null && 'message' in body &&
        typeof (body as { message: unknown }).message === 'string') {
        return (body as { message: string }).message;
    }
    return fallback;
}

export async function apiFetch<T>(
    accessToken: string,
    path: string,
    options: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Result<T>> {
    const base = apiBaseUrl();
    if (!base) return { ok: false, error: 'EXPO_PUBLIC_API_URL is not set. Add it to your .env file.' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const text = await res.text();
        let body: unknown;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }

        if (!res.ok) {
            return { ok: false, error: parseError(body, text || `HTTP ${res.status}`), status: res.status };
        }

        return { ok: true, data: body as T };
    } catch (e) {
        if (controller.signal.aborted) {
            return { ok: false, error: 'The server is taking too long to answer. Check your connection and try again.' };
        }
        return { ok: false, error: e instanceof Error ? e.message : 'Network request failed.' };
    } finally {
        clearTimeout(timer);
    }
}
