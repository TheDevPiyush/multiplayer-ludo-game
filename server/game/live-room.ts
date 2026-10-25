import { getPlayer, legalMoves, type Color, type GameEvent, type GameState } from '@ludo/engine';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
export type PresenceStatus = 'CONNECTED' | 'DISCONNECTED' | 'LEFT';

export interface LivePlayer {
    id: string;
    userId: string;
    seatNumber: number;
    color: Color;
    status: PresenceStatus;
    isReady: boolean;
    joinedAt: string;
    username: string;
    avatarUrl: string | null;
}

/**
 * One move, compact (a full game is a few hundred of these):
 * [color, token, dice, from, to, tenths of a second since the game started].
 */
export type MoveEntry = [color: Color, token: number, dice: number, from: number, to: number, at: number];

/** Everything about a room that is live in memory. JSON-serializable (Redis snapshot). */
export interface LiveRoom {
    id: string;
    gameCode: string;
    maxPlayers: number;
    isPrivate: boolean;
    voiceEnabled: boolean;
    createdById: string;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
    status: RoomStatus;
    winnerId: string | null;
    players: LivePlayer[];
    game: GameState | null;
    /** Bumped on every change clients must see. */
    version: number;
    /** Epoch ms when the current turn auto-plays, null when no timer runs. */
    turnEndsAt: number | null;
    /** Consecutive timed-out turns per user — 3+ switches them to autopilot. */
    timeouts: Record<string, number>;
    /** Every move this game, written to Postgres with the final result. */
    moveLog: MoveEntry[];
}

/** Shape the app renders (kept compatible with the previous REST payload). */
export function toRoomDto(room: LiveRoom) {
    const g = room.game;
    return {
        id: room.id,
        gameCode: room.gameCode,
        status: room.status,
        maxPlayers: room.maxPlayers,
        isPrivate: room.isPrivate,
        voiceEnabled: room.voiceEnabled,
        createdById: room.createdById,
        createdAt: room.createdAt,
        startedAt: room.startedAt,
        endedAt: room.endedAt,
        winnerId: room.winnerId,
        version: room.version,
        currentTurnColor: g && g.phase !== 'OVER' ? g.turn : null,
        currentDice: g?.dice ?? null,
        phase: g?.phase ?? null,
        movableTokens: g ? legalMoves(g) : [],
        turnEndsAt: room.turnEndsAt,
        /** Time left on the turn when this snapshot was made; clients time from this, not their own clock. */
        turnMsLeft: room.turnEndsAt === null ? null : Math.max(0, room.turnEndsAt - Date.now()),
        players: room.players.map(p => {
            const ps = g ? getPlayer(g, p.color) : undefined;
            return {
                id: p.id,
                gameRoomId: room.id,
                userId: p.userId,
                seatNumber: p.seatNumber,
                color: p.color,
                status: p.status,
                isReady: p.isReady,
                rank: ps?.rank ?? null,
                tokenPositions: ps?.tokens ?? [0, 0, 0, 0],
                joinedAt: p.joinedAt,
                leftAt: null,
                user: { username: p.username, avatarUrl: p.avatarUrl },
            };
        }),
    };
}

export type RoomDto = ReturnType<typeof toRoomDto>;

/** Non-engine events the lobby cares about. */
export type RoomEvent =
    | { type: 'PLAYER_JOINED'; userId: string }
    /** Lobby colors moved; `byUserId` picked, anyone else in `changes` followed (2-player corners). */
    | { type: 'COLORS_CHANGED'; byUserId: string; changes: { userId: string; from: Color; to: Color }[] }
    | { type: 'PLAYER_LEFT'; userId: string }
    | { type: 'STARTED' }
    | { type: 'CANCELLED'; reason: string };

export type SyncEvent = GameEvent | RoomEvent;

export interface RoomSync {
    version: number;
    room: RoomDto;
    events: SyncEvent[];
}

export function userIdOf(room: LiveRoom, color: Color): string | undefined {
    return room.players.find(p => p.color === color)?.userId;
}
