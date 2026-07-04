import { useCallback, useRef } from 'react';
import { useSocket } from '@/components/SocketProvider';

export type GameActionResult<T = unknown> =
    | { ok: true; data?: T; message?: string }
    | { ok: false; error: string };

function emitWithAck<T>(
    socket: ReturnType<typeof useSocket>['socket'],
    event: string,
    payload: unknown,
    timeoutMs = 12_000,
): Promise<GameActionResult<T>> {
    return new Promise((resolve) => {
        if (!socket?.connected) {
            resolve({ ok: false, error: 'Not connected to server.' });
            return;
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ ok: false, error: 'Request timed out.' });
        }, timeoutMs);

        socket.emit(event, payload, (res: GameActionResult<T>) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(res ?? { ok: false, error: 'No response from server.' });
        });
    });
}

export function useGameActions(gameCode: string | undefined) {
    const { socket, isRealtimeReady } = useSocket();
    const gameCodeRef = useRef(gameCode);
    gameCodeRef.current = gameCode;

    const rollDice = useCallback(async (): Promise<GameActionResult<{ diceValue: number }>> => {
        const code = gameCodeRef.current?.trim();
        if (!code) return { ok: false, error: 'No game code.' };
        if (!isRealtimeReady || !socket?.connected) {
            return { ok: false, error: 'Waiting for connection…' };
        }
        return emitWithAck(socket, 'game:roll-dice', { gameCode: code });
    }, [socket, isRealtimeReady]);

    const moveToken = useCallback(async (tokenIndex: number): Promise<GameActionResult> => {
        const code = gameCodeRef.current?.trim();
        if (!code) return { ok: false, error: 'No game code.' };
        if (!isRealtimeReady || !socket?.connected) {
            return { ok: false, error: 'Waiting for connection…' };
        }
        return emitWithAck(socket, 'game:move-token', { gameCode: code, tokenIndex });
    }, [socket, isRealtimeReady]);

    const skipTurn = useCallback(async (): Promise<GameActionResult> => {
        const code = gameCodeRef.current?.trim();
        if (!code) return { ok: false, error: 'No game code.' };
        if (!isRealtimeReady || !socket?.connected) {
            return { ok: false, error: 'Waiting for connection…' };
        }
        return emitWithAck(socket, 'game:skip-turn', { gameCode: code });
    }, [socket, isRealtimeReady]);

    const startGame = useCallback(async (): Promise<GameActionResult> => {
        const code = gameCodeRef.current?.trim();
        if (!code) return { ok: false, error: 'No game code.' };
        if (!isRealtimeReady || !socket?.connected) {
            return { ok: false, error: 'Waiting for connection…' };
        }
        return emitWithAck(socket, 'game:start', { gameCode: code });
    }, [socket, isRealtimeReady]);

    return { rollDice, moveToken, skipTurn, startGame, isRealtimeReady };
}
