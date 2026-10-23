import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { ServiceError } from './game-service';
import { games } from './services';
import { historyCache } from './user-cache';
import { log } from '../lib/logger';

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

export const getRoom = handle('getRoom', async (req, res) => {
    const room = await games.getRoom({ gameCode: String(req.params.gameCode ?? '').toUpperCase() });
    if (!room) return res.status(404).json({ message: "Room doesn't exist." });
    res.status(200).json({ data: games.dto(room) });
});

export const getHistory = handle('getHistory', async (req, res) => {
    const userId = req.user!.id;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const cacheKey = userId;
    const cached = historyCache.get(cacheKey) as { limit: number; data: unknown[] } | undefined;
    if (cached && cached.limit >= limit) {
        return res.status(200).json({ data: cached.data.slice(0, limit) });
    }

    const rows = await prisma.gamePlayer.findMany({
        where: { userId, gameRoom: { status: { in: ['FINISHED', 'CANCELLED'] } } },
        orderBy: { joinedAt: 'desc' },
        take: limit,
        select: {
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
    historyCache.set(cacheKey, { limit, data });
    res.status(200).json({ data });
});
