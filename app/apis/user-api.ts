import type { BackendUser } from '@/apis/auth-api';

export type { BackendUser };

export type GameHistoryEntry = {
    gameCode: string;
    status: 'FINISHED' | 'CANCELLED';
    maxPlayers: number;
    playerCount: number;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    myColor: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    myRank: number | null;
    isWin: boolean;
    winnerUsername: string | null;
    players: {
        userId: string;
        username: string;
        color: string;
        rank: number | null;
    }[];
};

type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; status?: number };

function apiBaseUrl(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

async function apiFetch<T>(
    accessToken: string,
    path: string,
    init?: RequestInit,
): Promise<Result<T>> {
    const base = apiBaseUrl();
    if (!base) return { ok: false, error: 'EXPO_PUBLIC_API_URL is not set.' };

    try {
        const res = await fetch(`${base}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(init?.headers ?? {}),
            },
        });

        const text = await res.text();
        let body: unknown;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        if (!res.ok) {
            const message =
                typeof body === 'object' && body !== null && 'message' in body &&
                typeof (body as { message: unknown }).message === 'string'
                    ? (body as { message: string }).message
                    : text || `HTTP ${res.status}`;
            return { ok: false, error: message, status: res.status };
        }

        return { ok: true, data: body as T };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error.' };
    }
}

export async function fetchMe(accessToken: string): Promise<Result<{ user: BackendUser }>> {
    return apiFetch(accessToken, '/auth/me');
}

export async function updateUsername(
    accessToken: string,
    username: string,
): Promise<Result<{ user: BackendUser; message: string }>> {
    return apiFetch(accessToken, '/auth/username', {
        method: 'PATCH',
        body: JSON.stringify({ username }),
    });
}

export async function fetchGameHistory(
    accessToken: string,
    limit = 40,
): Promise<Result<{ data: GameHistoryEntry[] }>> {
    return apiFetch(accessToken, `/game/history?limit=${limit}`);
}
