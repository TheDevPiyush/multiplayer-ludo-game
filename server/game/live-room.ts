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
    /** A server-played seat that fills public rooms. Never sent to clients. */
    isBot?: boolean;
}

/** Public rooms fill their free seats with bots, then start themselves (epoch ms). */
export interface LobbyAuto {
    /** Every seat is filled by this time; bots join one by one in the seconds before. */
    fillBy: number;
    /** When a full room starts its countdown, unless the host starts first. */
    countdownAt: number | null;
    /** When a running countdown ends and the game starts. Seats are locked meanwhile. */
    startsAt: number | null;
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
    /**
     * Epoch ms when the current turn starts: until then clients are still showing
     * the last action (dice landing, tokens hopping, the handoff pause).
     * Optional: snapshots from before it existed.
     */
    turnStartsAt?: number | null;
    /** Consecutive timed-out turns per user — 3+ switches them to autopilot. */
    timeouts: Record<string, number>;
    /** Every move this game, written to Postgres with the final result. */
    moveLog: MoveEntry[];
    /** Public rooms in the lobby only. */
    lobby?: LobbyAuto;
    /** Finished rooms: the room someone opened for a rematch, which the other players can join. */
    rematch?: Rematch;
    /** What each color did this game, for missions. Optional: snapshots from before it existed. */
    stats?: Partial<Record<Color, PlayerStats>>;
}

export interface PlayerStats {
    captures: number;
    /** Pawns brought home. */
    home: number;
    sixes: number;
    /** Got all pawns home (still earns if they leave the results afterwards). */
    finished?: boolean;
}

export interface Rematch {
    roomId: string;
    gameCode: string;
    byUserId: string;
}

/** Shape the app renders (kept compatible with the previous REST payload). */
export function toRoomDto(room: LiveRoom) {
    const g = room.game;
    const now = Date.now();
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
        turnMsLeft: room.turnEndsAt === null ? null : Math.max(0, room.turnEndsAt - now),
        turnStartsAt: room.turnStartsAt ?? null,
        /** Until the turn starts (0 once it has): clients keep the dice and tokens still meanwhile. */
        turnStartsInMs: room.turnStartsAt == null ? 0 : Math.max(0, room.turnStartsAt - now),
        /** Server clock when this snapshot was made, for clients' clock-offset estimate. */
        serverNow: now,
        /** Lobby countdown: the game starts in this many ms; null when no countdown runs. */
        startsInMs: room.lobby?.startsAt ? Math.max(0, room.lobby.startsAt - now) : null,
        rematch: room.rematch ?? null,
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
    | { type: 'CANCELLED'; reason: string }
    /** A finished game's player opened a rematch room (`room.rematch` has it). */
    | { type: 'REMATCH'; byUserId: string };

export type SyncEvent = GameEvent | RoomEvent;

export interface RoomSync {
    version: number;
    room: RoomDto;
    events: SyncEvent[];
}

export function userIdOf(room: LiveRoom, color: Color): string | undefined {
    return room.players.find(p => p.color === color)?.userId;
}
