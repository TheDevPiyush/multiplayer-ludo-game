import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { ServiceError } from './game-service';
import { games } from './services';
import { historyCache } from './user-cache';
import { log } from '../lib/logger';
import { onlineCount } from '../socket/room-presence';
import { afterCursor, pageParams, toPage } from '../lib/paging';

/** Maps service errors to HTTP responses. */
function handle(name: string, fn: (req: Request, res: Response) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            await fn(req, res);
        } catch (e) {
            if (e instanceof ServiceError) return res.status(e.status).json({ message: e.message });
            log.error(`${name} failed`, { user: req.user?.id, error: (e as Error)?.message });
            return res.status(500).json({ message: 'Something went wrong.' });
        }
    };
}

export const createRoom = handle('createRoom', async (req, res) => {
    const room = await games.createRoom(req.user!.id, req.body ?? {});
    res.status(201).json({ message: 'Room created.', data: games.dto(room) });
});

export const joinRoom = handle('joinRoom', async (req, res) => {
    const { room, player } = await games.joinRoom(req.user!.id, String(req.body?.gameCode ?? ''));
    const dto = games.dto(room);
    res.status(201).json({ message: 'Joined room.', data: { room: dto, player: dto.players.find(p => p.id === player.id) } });
});

export const leaveRoom = handle('leaveRoom', async (req, res) => {
    const message = await games.leaveRoom(req.user!.id, String(req.body?.gameCode ?? ''));
    res.status(200).json({ message });
});

export const cancelRoom = handle('cancelRoom', async (req, res) => {
    const room = await games.cancelRoom(req.user!.id, String(req.body?.gameCode ?? ''));
    res.status(200).json({ message: 'Room cancelled.', data: games.dto(room) });
});

export const startGame = handle('startGame', async (req, res) => {
    const room = await games.startGame(req.user!.id, String(req.body?.gameCode ?? ''));
    res.status(200).json({ message: 'Game started.', data: games.dto(room) });
});

const PUBLIC_LIMIT = 50;

/**
 * Open public rooms for the browse screen: nearly-full first (quickest to
 * start), then newest. Rooms nobody is connected to are left out — the host
 * has likely closed the app. Joining still re-checks everything.
 */
export const listPublicRooms = handle('listPublicRooms', async (_req, res) => {
    const data = games
        .openPublicRooms()
        .filter(r => onlineCount(r.id) > 0)
        .sort((a, b) => b.players.length - a.players.length || b.createdAt.localeCompare(a.createdAt))
        .slice(0, PUBLIC_LIMIT)
        .map(r => {
            const host = r.players.find(p => p.userId === r.createdById) ?? r.players[0];
            return {
                gameCode: r.gameCode,
                maxPlayers: r.maxPlayers,
                playerCount: r.players.length,
                voiceEnabled: r.voiceEnabled,
                createdAt: r.createdAt,
                host: host ? { id: host.userId, username: host.username, avatarUrl: host.avatarUrl } : null,
                players: r.players.map(p => ({ id: p.userId, username: p.username, avatarUrl: p.avatarUrl, color: p.color })),
            };
        });
    res.status(200).json({ data });
});

/** Newest first, paged. The first page is cached per user until their next game ends. */
export const getHistory = handle('getHistory', async (req, res) => {
    const userId = req.user!.id;
    const { limit, cursor } = pageParams(req);
    const firstPage = !cursor;
    if (firstPage) {
        const cached = historyCache.get(userId) as { limit: number; body: unknown } | undefined;
        if (cached && cached.limit === limit) return res.status(200).json(cached.body);
    }

    const found = await prisma.gamePlayer.findMany({
        where: { userId, gameRoom: { status: { in: ['FINISHED', 'CANCELLED'] } } },
        orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
        ...afterCursor(cursor, limit),
        select: {
            id: true,
            color: true,
            rank: true,
            gameRoom: {
                select: {
                    gameCode: true,
                    status: true,
                    maxPlayers: true,
                    startedAt: true,
                    endedAt: true,
                    createdAt: true,
                    winnerId: true,
                    players: {
                        select: { userId: true, color: true, rank: true, user: { select: { username: true } } },
                        orderBy: { seatNumber: 'asc' },
                    },
                },
            },
        },
    });
    const { rows, nextCursor } = toPage(found, limit);

    const data = rows.map(r => {
        const g = r.gameRoom;
        return {
            gameCode: g.gameCode,
            status: g.status,
            maxPlayers: g.maxPlayers,
            playerCount: g.players.length,
            startedAt: g.startedAt,
            endedAt: g.endedAt,
            createdAt: g.createdAt,
            myColor: r.color,
            myRank: r.rank,
            isWin: g.winnerId === userId,
            winnerUsername: g.players.find(p => p.userId === g.winnerId)?.user.username ?? null,
            players: g.players.map(p => ({ userId: p.userId, username: p.user.username, color: p.color, rank: p.rank })),
        };
    });
    const body = { data, nextCursor };
    if (firstPage) historyCache.set(userId, { limit, body });
    res.status(200).json(body);
});
