import type { BackendUser } from '@/apis/auth-api';
import { apiFetch, type Result } from './http';

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

/** One page of match history, newest first; pass `nextCursor` back for the next page. */
export async function fetchGameHistory(
    accessToken: string,
    cursor?: string,
): Promise<Result<{ data: GameHistoryEntry[]; nextCursor: string | null }>> {
    return apiFetch(accessToken, `/game/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
}

/** This device's Expo push token; the server keeps the user's 3 most recent devices. */
export async function savePushToken(accessToken: string, token: string): Promise<Result<{ saved: boolean }>> {
    return apiFetch(accessToken, '/auth/push-token', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function removePushToken(accessToken: string, token: string): Promise<Result<{ removed: boolean }>> {
    return apiFetch(accessToken, '/auth/push-token', { method: 'DELETE', body: JSON.stringify({ token }) }, 4_000);
}
