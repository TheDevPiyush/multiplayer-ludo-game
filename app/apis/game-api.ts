// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateRoomPayload = {
    maxPlayers: number;
    isPrivate: boolean;
    voiceEnabled: boolean;
};

export type GameRoomDto = {
    id: string;
    gameCode: string;
    status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
    maxPlayers: number;
    isPrivate: boolean;
    voiceEnabled: boolean;
    currentTurnColor: string | null;
    currentTurnUserId: string | null;
    currentDice: number | null;
    winnerId: string | null;
    createdById: string;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
};

export type GamePlayerDto = {
    id: string;
    gameRoomId: string;
    userId: string;
    seatNumber: number;
    color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    status: 'CONNECTED' | 'DISCONNECTED' | 'LEFT';
    isReady: boolean;
    rank: number | null;
    tokenPositions: number[];
    joinedAt: string;
    leftAt: string | null;
    user: {
        username: string;
        avatarUrl: string | null;
    };
};

export type GameRoomWithPlayers = GameRoomDto & { players: GamePlayerDto[] };

export type GameMoveDto = {
    id: string;
    gameRoomId: string;
    userId: string;
    tokenIndex: number;
    diceValue: number;
    fromPosition: number;
    toPosition: number;
    actionType: 'MOVE' | 'CAPTURE' | 'ENTER_HOME' | 'SAFE' | 'WIN';
    createdAt: string;
};

// ─── Result union helpers ─────────────────────────────────────────────────────

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; status?: number };
type Result<T> = Ok<T> | Fail;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function apiBaseUrl(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

function noBaseUrl(): Fail {
    return { ok: false, error: 'EXPO_PUBLIC_API_URL is not set. Add it to your .env file.' };
}

function parseError(body: unknown, fallback: string): string {
    if (typeof body === 'object' && body !== null && 'message' in body &&
        typeof (body as { message: unknown }).message === 'string') {
        return (body as { message: string }).message;
    }
    return fallback;
}

async function apiFetch<T>(
    accessToken: string,
    path: string,
    options: RequestInit = {},
): Promise<Result<T>> {
    const base = apiBaseUrl();
    if (!base) return noBaseUrl();

    try {
        const res = await fetch(`${base}${path}`, {
            ...options,
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
        return { ok: false, error: e instanceof Error ? e.message : 'Network request failed.' };
    }
}

// ─── Room APIs ────────────────────────────────────────────────────────────────

/** POST /game/room/create */
export async function createRoom(
    accessToken: string,
    payload: CreateRoomPayload,
): Promise<Result<{ message: string; data: GameRoomDto }>> {
    const result = await apiFetch<{ message: string; data: GameRoomDto }>(
        accessToken, '/game/room/create',
        { method: 'POST', body: JSON.stringify(payload) },
    );
    if (result.ok && !result.data?.data?.gameCode) {
        return { ok: false, error: 'Invalid response from server.' };
    }
    return result;
}

/** POST /game/room/join */
export async function joinRoom(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string; data: { room: GameRoomDto; player: GamePlayerDto } }>> {
    return apiFetch(accessToken, '/game/room/join', {
        method: 'POST',
        body: JSON.stringify({ gameCode }),
    });
}

/** POST /game/room/leave */
export async function leaveRoom(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string }>> {
    return apiFetch(accessToken, '/game/room/leave', {
        method: 'POST',
        body: JSON.stringify({ gameCode }),
    });
}

/** PATCH /game/room/cancel */
export async function cancelRoom(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string; data: GameRoomDto }>> {
    return apiFetch(accessToken, '/game/room/cancel', {
        method: 'PATCH',
        body: JSON.stringify({ gameCode }),
    });
}

/** POST /game/room/start */
export async function startGame(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string; data: GameRoomDto }>> {
    return apiFetch(accessToken, '/game/room/start', {
        method: 'POST',
        body: JSON.stringify({ gameCode }),
    });
}

/** GET /game/room/:gameCode */
export async function getRoom(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ data: GameRoomWithPlayers }>> {
    return apiFetch(accessToken, `/game/room/${gameCode}`, { method: 'GET' });
}

// ─── Game APIs ────────────────────────────────────────────────────────────────

/** POST /game/roll-dice */
export async function rollDice(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string; data: { diceValue: number } }>> {
    return apiFetch(accessToken, '/game/roll-dice', {
        method: 'POST',
        body: JSON.stringify({ gameCode }),
    });
}

/** POST /game/move-token */
export async function moveToken(
    accessToken: string,
    payload: {
        gameCode: string;
        tokenIndex: number;
        toPosition: number;
    },
): Promise<Result<{
    message: string;
    data: {
        actionType: GameMoveDto['actionType'];
        won: boolean;
        nextTurn: string;
    };
}>> {
    return apiFetch(accessToken, '/game/move-token', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function skipTurn(
    accessToken: string,
    gameCode: string,
): Promise<Result<{ message: string }>> {
    return apiFetch(accessToken, '/game/skip-turn', {
        method: 'POST',
        body: JSON.stringify({ gameCode }),
    });
}