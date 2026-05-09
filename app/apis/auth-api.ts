export type BackendUser = {
    id: string;
    username: string;
    avatarUrl: string | null;
    provider: string | null;
    providerId: string | null;
    totalWins: number;
    totalGames: number;
    createdAt: string;
    updatedAt: string;
};

export type RegisterUserResponse = {
    registered: boolean;
    user: BackendUser;
};

export type RegisterUserResult =
    | { ok: true; data: RegisterUserResponse }
    | { ok: false; error: string; status?: number };

function apiBaseUrl(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

export async function registerUserAfterOAuth(
    accessToken: string,
): Promise<RegisterUserResult> {
    const base = apiBaseUrl();
    if (!base) {
        return {
            ok: false,
            error:
                'EXPO_PUBLIC_API_URL is not set. Add it to .env (e.g. http://YOUR_IP:8080).',
        };
    }

    try {
        const res = await fetch(`${base}/auth/register`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
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
                typeof body === 'object' &&
                    body !== null &&
                    'message' in body &&
                    typeof (body as { message: unknown }).message === 'string'
                    ? (body as { message: string }).message
                    : text || `HTTP ${res.status}`;
            return { ok: false, error: message, status: res.status };
        }

        const data = body as RegisterUserResponse;
        if (!data?.user?.id) {
            return { ok: false, error: 'Invalid response from server.', status: res.status };
        }

        return { ok: true, data };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network request failed.';
        return { ok: false, error: msg };
    }
}
