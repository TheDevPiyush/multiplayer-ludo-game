import type { Href } from 'expo-router';

import { joinRoom, quickMatch, type GameRoomDto } from '@/apis/game-api';
import { setActiveRoom } from '@/util/active-room';
import { supabase } from '@/util/supabase-client';

export type EnterRoomResult =
    | { ok: true; href: Href; gameCode: string }
    | { ok: false; error: string; signedOut?: boolean };

/**
 * Joins a room by code — the server checks it's open and has a free seat —
 * and returns where to go: the lobby, or the board for a game you're already in.
 */
export async function joinRoomByCode(code: string): Promise<EnterRoomResult> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Please sign in first.', signedOut: true };

    const result = await joinRoom(token, code);
    if (!result.ok) {
        return { ok: false, error: result.status === 404 ? "This room doesn't exist anymore." : result.error };
    }

    return enter(result.data.data.room);
}

/** Join Public: the server seats you in the best open public room, or makes you a new one. */
export async function quickMatchRoom(): Promise<EnterRoomResult> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Please sign in first.', signedOut: true };

    const result = await quickMatch(token);
    if (!result.ok) return { ok: false, error: result.error };
    return enter(result.data.data.room);
}

/** Remembers the room and says where to go: the lobby, or the board for a game already running. */
async function enter(room: GameRoomDto): Promise<EnterRoomResult> {
    const screen = room.status === 'PLAYING' ? 'board' : 'lobby';
    await setActiveRoom({ roomId: room.id, gameCode: room.gameCode, maxPlayers: room.maxPlayers, screen });
    return {
        ok: true,
        gameCode: room.gameCode,
        href:
            screen === 'board'
                ? { pathname: '/(game)/board', params: { gameCode: room.gameCode, roomId: room.id } }
                : { pathname: '/(game)/lobby', params: { gameCode: room.gameCode, roomId: room.id, maxPlayers_: String(room.maxPlayers) } },
    };
}
