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
    /** Server state version — updates older than the current one are dropped. */
    version: number;
    phase: 'ROLL' | 'MOVE' | 'OVER' | null;
    /** Tokens the current player may move with the current dice (server-computed). */
    movableTokens: number[];
    /** Epoch ms when the server auto-plays this turn, null when no timer runs. */
    turnEndsAt: number | null;
    /** Time left on the turn when the server sent this snapshot (immune to device clock skew). */
    turnMsLeft?: number | null;
    /** Public lobbies: the game starts by itself in this many ms (from when the snapshot was sent); null when no countdown runs. */
    startsInMs?: number | null;
};

type Color = RoomPlayer['color'];

/** Engine events as sent by the server in `room:sync`. */
export type SyncEvent =
    | { type: 'ROLLED'; color: Color; value: number }
    | { type: 'MOVED'; color: Color; token: number; from: number; to: number; path: number[] }
    | { type: 'CAPTURED'; color: Color; token: number; by: Color; cell: number }
    | { type: 'HOME'; color: Color; token: number }
    | { type: 'FINISHED'; color: Color; rank: number }
    | { type: 'LEFT'; color: Color }
    | { type: 'TURN'; color: Color; reason: string }
    | { type: 'OVER'; ranking: Color[] }
    | { type: 'PLAYER_JOINED'; userId: string }
    | { type: 'COLORS_CHANGED'; byUserId: string; changes: ColorChange[] }
    | { type: 'PLAYER_LEFT'; userId: string }
    | { type: 'STARTED' }
    | { type: 'CANCELLED'; reason: string };

type RoomSync = { version: number; room: GameRoom; events: SyncEvent[] };

export type ColorChange = { userId: string; from: Color; to: Color };

export type RoomEvent =
    | { type: 'dice'; diceValue: number; byUserId: string; color: string }
    | { type: 'move'; byUserId: string; color: string; tokenIndex: number; fromPosition: number; toPosition: number; diceValue: number }
    | { type: 'capture'; byUserId: string; capturedUserId: string; capturedColor: string; capturedTokenIndex: number }
    | { type: 'turn'; currentTurnColor: GameRoom['currentTurnColor']; currentDice: number | null; reason: string }
    | { type: 'over'; winnerId: string; winnerColor: string }
    | { type: 'started' }
    | { type: 'cancelled'; reason: string }
    /** Lobby colors moved: `byUserId` picked; others in `changes` followed (2-player corners). */
    | { type: 'colors'; byUserId: string; changes: ColorChange[] }
    | { type: 'presence:disconnecting'; userId: string; graceMs: number }
    | { type: 'presence:disconnected'; userId: string }
    | { type: 'presence:connected'; userId: string }
    | { type: 'presence:reconnected'; userId: string };

export type DisconnectingPlayer = {
    userId: string;
    graceMs: number;
    expiresAt: number;
};

interface UseGameRoomOpts {
    roomId?: string;
    gameCode?: string;
    onEvent?: (e: RoomEvent) => void;
    /** The engine events of each accepted update, as sent (sounds use these as-is). */
    onEvents?: (events: SyncEvent[]) => void;
}

export function useGameRoom({ roomId, gameCode, onEvent, onEvents }: UseGameRoomOpts) {
    const { socket, isRealtimeReady, connectionPhase, connectGeneration } = useSocket();
    const [room, setRoom] = useState<GameRoom | null>(null);
    /** Bumped each time this socket (re)joins the room: requests that need membership wait for it. */
    const [joinCount, setJoinCount] = useState(0);
    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [disconnectingPlayers, setDisconnectingPlayers] = useState<DisconnectingPlayer[]>([]);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const onEventsRef = useRef(onEvents);
    onEventsRef.current = onEvents;

    const roomIdRef = useRef(roomId);
    const gameCodeRef = useRef(gameCode);
    const wantsInRoomRef = useRef(false);
    const hasJoinedRef = useRef(false);
    const lastJoinGenRef = useRef(-1);
    const versionRef = useRef(0);

    roomIdRef.current = roomId;
    gameCodeRef.current = gameCode;
    wantsInRoomRef.current = !!(roomId && gameCode);

    useEffect(() => {
        hasJoinedRef.current = false;
        lastJoinGenRef.current = -1;
        versionRef.current = 0;
    }, [roomId, gameCode]);

    /**
     * Accept a full room snapshot only if it is newer than what we have.
     * `force` is used for (re)join snapshots — they are authoritative even if the
     * server restarted and its version counter went backwards.
     */
    const acceptRoom = useCallback((next: GameRoom | undefined | null, force = false): boolean => {
        if (!next) return false;
        if (!force && (next.version ?? 0) < versionRef.current) return false;
        versionRef.current = next.version ?? 0;
        setRoom(next);
        return true;
    }, []);

    const fire = useCallback((e: RoomEvent) => {
        onEventRef.current?.(e);
    }, []);

    const applyJoinResponse = useCallback((res: any) => {
        if (!res?.ok) {
            setJoinError(res?.error ?? 'Failed to join room.');
            return;
        }
        setJoinError(null);
        acceptRoom(res.data.room, true);
        setOnlineUserIds(res.data.onlineUserIds ?? []);
        hasJoinedRef.current = true;
        setJoinCount(n => n + 1);
    }, [acceptRoom]);

    const refresh = useCallback(async () => {
        if (!socket?.connected || !roomIdRef.current) return;
        await new Promise<void>((resolve) => {
            socket.emit('room:state', { roomId: roomIdRef.current }, (res: any) => {
                if (res?.ok) {
                    acceptRoom(res.data.room, true);
                    setOnlineUserIds(res.data.onlineUserIds ?? []);
                }
                resolve();
            });
        });
    }, [socket, acceptRoom]);

    const joinSocketRoom = useCallback((isReconnect: boolean) => {
        const s = socket;
        const rid = roomIdRef.current;
        const code = gameCodeRef.current;
        if (!s?.connected || !rid || !code) return;

        const event = isReconnect ? 'room:rejoin' : 'room:join';
        s.emit(event, { roomId: rid, gameCode: code }, applyJoinResponse);
    }, [socket, applyJoinResponse]);

    // Join / rejoin when socket becomes ready — never emit room:leave on transient disconnect
    useEffect(() => {
        if (!wantsInRoomRef.current || !isRealtimeReady || !socket) return;
        if (lastJoinGenRef.current === connectGeneration) return;

        const isReconnect = hasJoinedRef.current;
        lastJoinGenRef.current = connectGeneration;
        joinSocketRoom(isReconnect);
    }, [isRealtimeReady, socket, connectGeneration, joinSocketRoom]);

    // Do NOT emit room:leave on unmount — lobby → board navigation would
    // tear down socket presence. Call leaveRoom() explicitly when
    // the user exits the game (lobby/board beforeRemove handlers).
    useEffect(() => {
        return () => {
            hasJoinedRef.current = false;
        };
    }, []);

    // Listeners
    useEffect(() => {
        if (!socket) return;

        const markOnline = (userId: string) => {
            setOnlineUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
            setDisconnectingPlayers(prev => prev.filter(p => p.userId !== userId));
            setRoom(prev => prev ? {
                ...prev,
                players: prev.players.map(p =>
                    p.userId === userId && p.status !== 'LEFT' ? { ...p, status: 'CONNECTED' } : p,
                ),
            } : prev);
        };
        const onConnected = ({ userId }: any) => {
            markOnline(userId);
            fire({ type: 'presence:connected', userId });
        };
        const onReconnected = ({ userId }: any) => {
            markOnline(userId);
            fire({ type: 'presence:reconnected', userId });
        };
        const onDisconnecting = ({ userId, graceMs }: any) => {
            const expiresAt = Date.now() + (graceMs ?? 25_000);
            setDisconnectingPlayers(prev => {
                const filtered = prev.filter(p => p.userId !== userId);
                return [...filtered, { userId, graceMs: graceMs ?? 25_000, expiresAt }];
            });
            fire({ type: 'presence:disconnecting', userId, graceMs });
        };
        const onDisconnected = ({ userId }: any) => {
            setOnlineUserIds(prev => prev.filter(u => u !== userId));
            setDisconnectingPlayers(prev => prev.filter(p => p.userId !== userId));
            setRoom(prev => prev ? {
                ...prev,
                players: prev.players.map(p =>
                    p.userId === userId && p.status !== 'LEFT' ? { ...p, status: 'DISCONNECTED' } : p,
                ),
            } : prev);
            fire({ type: 'presence:disconnected', userId });
        };
        // One authoritative stream: full room snapshot + the events that produced it.
        const onSync = (sync: RoomSync) => {
            // The socket stays subscribed to rooms this player left: only this screen's room counts.
            if (!sync?.room || sync.room.id !== roomIdRef.current || sync.version <= versionRef.current) return;
            const players = sync.room.players;
            const userOf = (color: string) => players.find(p => p.color === color)?.userId ?? '';
            const lastDice = sync.events.find(e => e.type === 'ROLLED');
            const diceForMove = lastDice?.type === 'ROLLED' ? lastDice.value : sync.room.currentDice ?? 0;

            acceptRoom(sync.room);
            if (sync.events.length > 0) onEventsRef.current?.(sync.events);

            for (const e of sync.events) {
                switch (e.type) {
                    case 'ROLLED':
                        fire({ type: 'dice', diceValue: e.value, byUserId: userOf(e.color), color: e.color });
                        break;
                    case 'MOVED':
                        fire({
                            type: 'move', byUserId: userOf(e.color), color: e.color, tokenIndex: e.token,
                            fromPosition: e.from, toPosition: e.to, diceValue: diceForMove,
                        });
                        break;
                    case 'CAPTURED':
                        fire({
                            type: 'capture', byUserId: userOf(e.by), capturedUserId: userOf(e.color),
                            capturedColor: e.color, capturedTokenIndex: e.token,
                        });
                        break;
                    case 'TURN':
                        fire({ type: 'turn', currentTurnColor: e.color, currentDice: null, reason: e.reason });
                        break;
                    case 'OVER':
                        fire({ type: 'over', winnerId: sync.room.winnerId ?? userOf(e.ranking[0] ?? ''), winnerColor: e.ranking[0] ?? '' });
                        break;
                    case 'STARTED':
                        fire({ type: 'started' });
                        break;
                    case 'CANCELLED':
                        fire({ type: 'cancelled', reason: e.reason });
                        break;
                    case 'COLORS_CHANGED':
                        fire({ type: 'colors', byUserId: e.byUserId, changes: e.changes });
                        break;
                    case 'PLAYER_LEFT':
                        setOnlineUserIds(prev => prev.filter(u => u !== e.userId));
                        setDisconnectingPlayers(prev => prev.filter(p => p.userId !== e.userId));
                        break;
                }
            }
        };

        socket.on('room:sync', onSync);
        socket.on('presence:connected', onConnected);
        socket.on('presence:reconnected', onReconnected);
        socket.on('presence:disconnecting', onDisconnecting);
        socket.on('presence:disconnected', onDisconnected);

        return () => {
            socket.off('room:sync', onSync);
            socket.off('presence:connected', onConnected);
            socket.off('presence:reconnected', onReconnected);
            socket.off('presence:disconnecting', onDisconnecting);
            socket.off('presence:disconnected', onDisconnected);
        };
    }, [socket, fire, acceptRoom]);

    // Prune expired disconnecting grace entries
    useEffect(() => {
        if (disconnectingPlayers.length === 0) return;
        const t = setInterval(() => {
            const now = Date.now();
            setDisconnectingPlayers(prev => prev.filter(p => p.expiresAt > now));
        }, 1000);
        return () => clearInterval(t);
    }, [disconnectingPlayers.length]);

    return {
        room,
        joinCount,
        onlineUserIds,
        disconnectingPlayers,
        joinError,
        refresh,
        connectionPhase,
        isRealtimeReady,
        leaveRoom: useCallback(() => {
            wantsInRoomRef.current = false;
            const s = socket;
            const rid = roomIdRef.current;
            if (s?.connected && rid) {
                s.emit('room:leave', { roomId: rid });
            }
            hasJoinedRef.current = false;
        }, [socket]),
    };
}
