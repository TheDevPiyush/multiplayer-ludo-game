import { apiFetch, type Result } from './http';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateRoomPayload = {
    maxPlayers: number;
    isPrivate: boolean;
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

/** POST /game/quick-match — the server picks an open public room (or makes one) and seats you. */
export async function quickMatch(
    accessToken: string,
): Promise<Result<{ message: string; data: { room: GameRoomDto; player: GamePlayerDto } }>> {
    return apiFetch(accessToken, '/game/quick-match', { method: 'POST' });
}
