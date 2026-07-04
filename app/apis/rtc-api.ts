export type IceServer = {
    urls: string | string[];
    username?: string;
    credential?: string;
};

type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

function apiBaseUrl(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

/** GET /rtc/ice-servers — TURN/STUN config with short-lived credentials */
export async function fetchIceServers(
    accessToken: string,
): Promise<Result<{ iceServers: IceServer[]; expiresAt: number }>> {
    const base = apiBaseUrl();
    if (!base) return { ok: false, error: 'EXPO_PUBLIC_API_URL is not set.' };

    try {
        const res = await fetch(`${base}/rtc/ice-servers`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: body?.message ?? `HTTP ${res.status}` };
        }
        return { ok: true, data: body.data };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network request failed.' };
    }
}
