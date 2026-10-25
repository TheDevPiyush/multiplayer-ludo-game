import type { Href } from 'expo-router';

import { joinRoom } from '@/apis/game-api';
import { setActiveRoom } from '@/util/active-room';
import { supabase } from '@/util/supabase-client';

export type EnterRoomResult =
    | { ok: true; href: Href }
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

    const { room } = result.data.data;
    const screen = room.status === 'PLAYING' ? 'board' : 'lobby';
    await setActiveRoom({ roomId: room.id, gameCode: room.gameCode, maxPlayers: room.maxPlayers, screen });
    return {
        ok: true,
        href:
            screen === 'board'
                ? { pathname: '/(game)/board', params: { gameCode: room.gameCode, roomId: room.id } }
                : { pathname: '/(game)/lobby', params: { gameCode: room.gameCode, roomId: room.id, maxPlayers_: String(room.maxPlayers) } },
    };
}
