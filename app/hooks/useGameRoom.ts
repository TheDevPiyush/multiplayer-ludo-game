import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/SocketProvider';

export type RoomPlayer = {
    id: string;
    userId: string;
    seatNumber: number;
    color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    status: 'CONNECTED' | 'DISCONNECTED' | 'LEFT';
    isReady: boolean;
    rank: number | null;
    tokenPositions: number[];
    user: { username: string; avatarUrl: string | null };
};

export type GameRoom = {
    id: string;
    gameCode: string;
    status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
    maxPlayers: number;
    isPrivate: boolean;
    voiceEnabled: boolean;
    currentTurnColor: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW' | null;
    currentDice: number | null;
    winnerId: string | null;
    createdById: string;
    players: RoomPlayer[];
};

export type RoomEvent =
    | { type: 'dice'; diceValue: number; byUserId: string; color: string }
    | { type: 'move'; byUserId: string; color: string; tokenIndex: number; fromPosition: number; toPosition: number; diceValue: number }
    | { type: 'capture'; byUserId: string; capturedUserId: string; capturedColor: string; capturedTokenIndex: number }
    | { type: 'turn'; currentTurnColor: GameRoom['currentTurnColor']; currentDice: number | null; reason: string }
    | { type: 'over'; winnerId: string; winnerColor: string }
    | { type: 'started' }
    | { type: 'cancelled'; reason: string }
    | { type: 'presence:disconnecting'; userId: string; graceMs: number }
    | { type: 'presence:disconnected'; userId: string }
    | { type: 'presence:connected'; userId: string };

interface UseGameRoomOpts {
    roomId?: string;
    gameCode?: string;
    onEvent?: (e: RoomEvent) => void;
}

export function useGameRoom({ roomId, gameCode, onEvent }: UseGameRoomOpts) {
    const { socket, status } = useSocket();
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const [voicePeers, setVoicePeers] = useState<string[]>([]);
    const [joinError, setJoinError] = useState<string | null>(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const fire = useCallback((e: RoomEvent) => {
        onEventRef.current?.(e);
    }, []);

    const refresh = useCallback(async () => {
        if (!socket || !roomId) return;
        await new Promise<void>((resolve) => {
            socket.emit('room:state', { roomId }, (res: any) => {
                if (res?.ok) {
                    setRoom(res.data.room);
                    setOnlineUserIds(res.data.onlineUserIds ?? []);
                    setVoicePeers(res.data.voicePeers ?? []);
                }
                resolve();
            });
        });
    }, [socket, roomId]);

    // Join room when socket ready
    useEffect(() => {
        if (!socket || status !== 'connected' || !roomId || !gameCode) return;

        let cancelled = false;
        socket.emit('room:join', { roomId, gameCode }, (res: any) => {
            if (cancelled) return;
            if (!res?.ok) {
                setJoinError(res?.error ?? 'Failed to join room.');
                return;
            }
            setJoinError(null);
            setRoom(res.data.room);
            setOnlineUserIds(res.data.onlineUserIds ?? []);
            setVoicePeers(res.data.voicePeers ?? []);
        });

        return () => {
            cancelled = true;
            socket.emit('room:leave', { roomId });
        };
    }, [socket, status, roomId, gameCode]);

    // Listeners
    useEffect(() => {
        if (!socket) return;

        const onPlayerJoined = ({ player }: any) => {
            setRoom(prev => {
                if (!prev) return prev;
                const exists = prev.players.some(p => p.id === player.id);
                return {
                    ...prev,
                    players: exists
                        ? prev.players.map(p => (p.id === player.id ? { ...p, ...player } : p))
                        : [...prev.players, player].sort((a, b) => a.seatNumber - b.seatNumber),
                };
            });
        };
        const onPlayerLeft = ({ userId }: any) => {
            setRoom(prev => {
                if (!prev) return prev;
                if (prev.status === 'WAITING') {
                    return { ...prev, players: prev.players.filter(p => p.userId !== userId) };
                }
                return {
                    ...prev,
                    players: prev.players.map(p =>
                        p.userId === userId ? { ...p, status: 'LEFT' as const } : p
                    ),
                };
            });
            setOnlineUserIds(prev => prev.filter(u => u !== userId));
        };
        const onConnected = ({ userId }: any) => {
            setOnlineUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
            setRoom(prev => prev ? {
                ...prev,
                players: prev.players.map(p =>
                    p.userId === userId && p.status !== 'LEFT' ? { ...p, status: 'CONNECTED' } : p,
                ),
            } : prev);
            fire({ type: 'presence:connected', userId });
        };
        const onDisconnecting = ({ userId, graceMs }: any) =>
            fire({ type: 'presence:disconnecting', userId, graceMs });
        const onDisconnected = ({ userId }: any) => {
            setOnlineUserIds(prev => prev.filter(u => u !== userId));
            setRoom(prev => prev ? {
                ...prev,
                players: prev.players.map(p =>
                    p.userId === userId && p.status !== 'LEFT' ? { ...p, status: 'DISCONNECTED' } : p,
                ),
            } : prev);
            fire({ type: 'presence:disconnected', userId });
        };
        const onGameStarted = ({ currentTurnColor }: any) => {
            setRoom(prev => prev ? { ...prev, status: 'PLAYING', currentTurnColor } : prev);
            fire({ type: 'started' });
        };
        const onRoomCancelled = ({ reason }: any) => {
            setRoom(prev => prev ? { ...prev, status: 'CANCELLED' } : prev);
            fire({ type: 'cancelled', reason });
        };
        const onDiceRolled = ({ diceValue, byUserId, color }: any) => {
            setRoom(prev => prev ? { ...prev, currentDice: diceValue } : prev);
            fire({ type: 'dice', diceValue, byUserId, color });
        };
        const onTokenMoved = (p: any) => {
            setRoom(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    players: prev.players.map(pl => {
                        if (pl.userId !== p.byUserId) return pl;
                        const np = [...pl.tokenPositions];
                        np[p.tokenIndex] = p.toPosition;
                        return { ...pl, tokenPositions: np };
                    }),
                };
            });
            fire({ type: 'move', ...p });
        };
        const onCaptured = (p: any) => {
            setRoom(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    players: prev.players.map(pl => {
                        if (pl.userId !== p.capturedUserId) return pl;
                        const np = [...pl.tokenPositions];
                        np[p.capturedTokenIndex] = 0;
                        return { ...pl, tokenPositions: np };
                    }),
                };
            });
            fire({ type: 'capture', ...p });
        };
        const onTurnChanged = ({ currentTurnColor, currentDice, reason }: any) => {
            setRoom(prev => prev ? { ...prev, currentTurnColor, currentDice } : prev);
            fire({ type: 'turn', currentTurnColor, currentDice, reason });
        };
        const onGameOver = ({ winnerId, winnerColor }: any) => {
            setRoom(prev => prev ? { ...prev, status: 'FINISHED', winnerId } : prev);
            fire({ type: 'over', winnerId, winnerColor });
        };
        const onVoicePeerJoined = ({ userId }: any) =>
            setVoicePeers(prev => (prev.includes(userId) ? prev : [...prev, userId]));
        const onVoicePeerLeft = ({ userId }: any) =>
            setVoicePeers(prev => prev.filter(u => u !== userId));

        socket.on('player:joined', onPlayerJoined);
        socket.on('player:left', onPlayerLeft);
        socket.on('presence:connected', onConnected);
        socket.on('presence:disconnecting', onDisconnecting);
        socket.on('presence:disconnected', onDisconnected);
        socket.on('game:started', onGameStarted);
        socket.on('room:cancelled', onRoomCancelled);
        socket.on('dice:rolled', onDiceRolled);
        socket.on('token:moved', onTokenMoved);
        socket.on('token:captured', onCaptured);
        socket.on('turn:changed', onTurnChanged);
        socket.on('game:over', onGameOver);
        socket.on('voice:peer-joined', onVoicePeerJoined);
        socket.on('voice:peer-left', onVoicePeerLeft);

        return () => {
            socket.off('player:joined', onPlayerJoined);
            socket.off('player:left', onPlayerLeft);
            socket.off('presence:connected', onConnected);
            socket.off('presence:disconnecting', onDisconnecting);
            socket.off('presence:disconnected', onDisconnected);
            socket.off('game:started', onGameStarted);
            socket.off('room:cancelled', onRoomCancelled);
            socket.off('dice:rolled', onDiceRolled);
            socket.off('token:moved', onTokenMoved);
            socket.off('token:captured', onCaptured);
            socket.off('turn:changed', onTurnChanged);
            socket.off('game:over', onGameOver);
            socket.off('voice:peer-joined', onVoicePeerJoined);
            socket.off('voice:peer-left', onVoicePeerLeft);
        };
    }, [socket, fire]);

    // Auto-refresh on reconnect
    useEffect(() => {
        if (status === 'connected' && roomId) {
            void refresh();
        }
    }, [status, roomId, refresh]);

    return {
        room,
        onlineUserIds,
        voicePeers,
        joinError,
        refresh,
        connectionStatus: status,
    };
}
