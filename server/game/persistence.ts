import { createGame, type Color, type GameState } from '@ludo/engine';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { BOT_PROVIDER } from './bots';
import type { LivePlayer, LiveRoom, MoveEntry, RoomStatus } from './live-room';

export interface Profile {
    username: string;
    avatarUrl: string | null;
}

/**
 * Durable storage. Called at room lifecycle moments (create / join / start /
 * finish) and by the periodic flush — never once per dice roll.
 */
export interface Persistence {
    createRoom(room: LiveRoom): Promise<void>;
    addPlayer(room: LiveRoom, player: LivePlayer): Promise<void>;
    removePlayer(room: LiveRoom, player: LivePlayer): Promise<void>;
    /** Lobby color changes, applied in the given order (each step keeps colors unique). */
    setPlayerColors(room: LiveRoom, changes: { playerId: string; color: Color }[]): Promise<void>;
    /** Status / timestamps / game snapshot. */
    saveRoom(room: LiveRoom): Promise<void>;
    /** One transaction: final state, ranks, move log, user stats. */
    finishGame(room: LiveRoom): Promise<void>;
    loadRoom(key: { id?: string; gameCode?: string }): Promise<LiveRoom | null>;
    codeExists(gameCode: string): Promise<boolean>;
    getProfile(userId: string): Promise<Profile | null>;
}

/** Fast restart-safe copy of live rooms. Optional (REDIS_URL). */
export interface SnapshotStore {
    save(room: LiveRoom): Promise<void>;
    /** Lets `load({ gameCode })` find the room; written once, when the game starts. */
    index(room: LiveRoom): Promise<void>;
    load(key: { id?: string; gameCode?: string }): Promise<LiveRoom | null>;
    delete(room: LiveRoom): Promise<void>;
}

// ─── Postgres (Prisma) ───────────────────────────────────────────────────────

type DbRoom = NonNullable<Awaited<ReturnType<typeof findRoom>>>;

function findRoom(where: { id: string } | { gameCode: string }) {
    return prisma.gameRoom.findUnique({
        where,
        include: {
            players: {
                include: { user: { select: { username: true, avatarUrl: true, provider: true } } },
                orderBy: { seatNumber: 'asc' },
            },
        },
    });
}

/** Rebuild engine state for rooms saved before snapshots existed. */
function legacyGameState(db: DbRoom): GameState {
    const g = createGame({ colors: db.players.map(p => p.color as Color) });
    for (const ps of g.players) {
        const row = db.players.find(p => p.color === ps.color)!;
        ps.tokens = [...row.tokenPositions];
        ps.rank = row.rank;
        ps.active = row.status !== 'LEFT';
    }
    if (db.currentTurnColor) g.turn = db.currentTurnColor as Color;
    return g;
}

function fromDb(db: DbRoom): LiveRoom {
    const status = db.status as RoomStatus;
    const game = (db.gameState as unknown as GameState | null) ?? (status === 'PLAYING' ? legacyGameState(db) : null);
    return {
        id: db.id,
        gameCode: db.gameCode,
        maxPlayers: db.maxPlayers,
        isPrivate: db.isPrivate,
        voiceEnabled: db.voiceEnabled,
        createdById: db.createdById,
        createdAt: db.createdAt.toISOString(),
        startedAt: db.startedAt?.toISOString() ?? null,
        endedAt: db.endedAt?.toISOString() ?? null,
        status,
        winnerId: db.winnerId,
        players: db.players.map(p => ({
            id: p.id,
            userId: p.userId,
            seatNumber: p.seatNumber,
            color: p.color as Color,
            // Presence is live-only; everyone starts offline until their socket joins.
            status: p.status === 'LEFT' ? 'LEFT' : p.user.provider === BOT_PROVIDER ? 'CONNECTED' : 'DISCONNECTED',
            isReady: p.isReady,
            joinedAt: p.joinedAt.toISOString(),
            username: p.user.username,
            avatarUrl: p.user.avatarUrl,
            ...(p.user.provider === BOT_PROVIDER ? { isBot: true } : {}),
        })),
        game,
        version: db.stateVersion,
        turnEndsAt: null,
        timeouts: {},
        // Only written at the end of a game: after a restart without Redis the log starts over.
        moveLog: (db.moveLog as MoveEntry[] | null) ?? [],
    };
}

function roomColumns(room: LiveRoom) {
    const g = room.game;
    return {
        status: room.status,
        // Changes when the host of a public room leaves and another player takes over.
        createdById: room.createdById,
        startedAt: room.startedAt ? new Date(room.startedAt) : null,
        endedAt: room.endedAt ? new Date(room.endedAt) : null,
        winnerId: room.winnerId,
        currentTurnColor: g && g.phase !== 'OVER' ? g.turn : null,
        currentDice: g?.dice ?? null,
        gameState: (g ?? undefined) as object | undefined,
        stateVersion: room.version,
    };
}

export const prismaPersistence: Persistence = {
    async createRoom(room) {
        const host = room.players[0]!;
        await prisma.gameRoom.create({
            data: {
                id: room.id,
                gameCode: room.gameCode,
                createdById: room.createdById,
                maxPlayers: room.maxPlayers,
                isPrivate: room.isPrivate,
                voiceEnabled: room.voiceEnabled,
                status: 'WAITING',
                players: {
                    create: {
                        id: host.id,
                        userId: host.userId,
                        seatNumber: host.seatNumber,
                        color: host.color,
                        isReady: true,
                    },
                },
            },
        });
    },

    async addPlayer(room, player) {
        await prisma.gamePlayer.create({
            data: {
                id: player.id,
                gameRoomId: room.id,
                userId: player.userId,
                seatNumber: player.seatNumber,
                color: player.color,
                isReady: player.isReady,
            },
        });
    },

    async removePlayer(_room, player) {
        await prisma.gamePlayer.deleteMany({ where: { id: player.id } });
    },

    async setPlayerColors(_room, changes) {
        // A transaction runs its statements in order, so the per-step uniqueness holds.
        await prisma.$transaction(
            changes.map(c => prisma.gamePlayer.update({ where: { id: c.playerId }, data: { color: c.color } })),
        );
    },

    async saveRoom(room) {
        await prisma.gameRoom.update({ where: { id: room.id }, data: roomColumns(room) });
    },

    async finishGame(room) {
        const g = room.game!;
        const playerUpdates = room.players.map(p => {
            const ps = g.players.find(x => x.color === p.color);
            return prisma.gamePlayer.update({
                where: { id: p.id },
                data: { rank: ps?.rank ?? null, tokenPositions: ps?.tokens ?? [0, 0, 0, 0], status: p.status },
            });
        });
        const statUpdates = room.players.map(p =>
            prisma.user.update({
                where: { id: p.userId },
                data: {
                    totalGames: { increment: 1 },
                    ...(p.userId === room.winnerId ? { totalWins: { increment: 1 } } : {}),
                },
            }),
        );
        await prisma.$transaction([
            prisma.gameRoom.update({ where: { id: room.id }, data: { ...roomColumns(room), moveLog: room.moveLog } }),
            ...playerUpdates,
            ...statUpdates,
        ]);
    },

    async loadRoom(key) {
        const where = key.id ? { id: key.id } : key.gameCode ? { gameCode: key.gameCode } : null;
        if (!where) return null;
        const db = await findRoom(where);
        return db ? fromDb(db) : null;
    },

    async codeExists(gameCode) {
        const row = await prisma.gameRoom.findUnique({ where: { gameCode }, select: { id: true } });
        return !!row;
    },

    async getProfile(userId) {
        return prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } });
    },
};

// ─── Redis ───────────────────────────────────────────────────────────────────

const SNAPSHOT_TTL_S = 6 * 60 * 60;

export const redisSnapshots: SnapshotStore | null = redis
    ? {
        async save(room) {
            await redis!.set(`ludo:room:${room.id}`, JSON.stringify(room), 'EX', SNAPSHOT_TTL_S);
        },
        async index(room) {
            await redis!.set(`ludo:code:${room.gameCode}`, room.id, 'EX', SNAPSHOT_TTL_S);
        },
        async load(key) {
            const id = key.id ?? (key.gameCode ? await redis!.get(`ludo:code:${key.gameCode}`) : null);
            if (!id) return null;
            const raw = await redis!.get(`ludo:room:${id}`);
            return raw ? (JSON.parse(raw) as LiveRoom) : null;
        },
        async delete(room) {
            await redis!.del(`ludo:room:${room.id}`, `ludo:code:${room.gameCode}`);
        },
    }
    : null;
