import type { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

/**
 * Tracks per (roomId,userId) the set of live sockets.
 * On last socket of a user disconnecting → start a grace timer.
 * If the timer fires → mark player DISCONNECTED and broadcast to room.
 * If it's their turn → auto-skip.
 */

type RoomKey = string;
type UserKey = string;

const liveSockets = new Map<RoomKey, Map<UserKey, Set<string>>>();
const graceTimers = new Map<string, NodeJS.Timeout>();

const GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS ?? 25_000);

function key(roomId: string, userId: string) {
    return `${roomId}:${userId}`;
}

export function getRoomPresence(roomId: string): string[] {
    const users = liveSockets.get(roomId);
    if (!users) return [];
    return Array.from(users.keys());
}

export function isUserOnline(roomId: string, userId: string): boolean {
    return (liveSockets.get(roomId)?.get(userId)?.size ?? 0) > 0;
}

export function addSocket(roomId: string, userId: string, socketId: string) {
    let users = liveSockets.get(roomId);
    if (!users) {
        users = new Map();
        liveSockets.set(roomId, users);
    }
    let set = users.get(userId);
    if (!set) {
        set = new Set();
        users.set(userId, set);
    }
    set.add(socketId);

    const t = graceTimers.get(key(roomId, userId));
    if (t) {
        clearTimeout(t);
        graceTimers.delete(key(roomId, userId));
    }
}

export function removeSocket(roomId: string, userId: string, socketId: string) {
    const users = liveSockets.get(roomId);
    if (!users) return;
    const set = users.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
        users.delete(userId);
        if (users.size === 0) liveSockets.delete(roomId);
    }
}

/**
 * Schedule a grace timer that fires DISCONNECT side-effects after delay.
 * Returns true if a timer was scheduled.
 */
export function scheduleDisconnect(
    io: Server,
    roomId: string,
    userId: string,
    onTimeout: (roomId: string, userId: string) => Promise<void>,
): boolean {
    if (isUserOnline(roomId, userId)) return false;
    const k = key(roomId, userId);
    if (graceTimers.has(k)) return false;

    io.to(`room:${roomId}`).emit('presence:disconnecting', {
        userId,
        graceMs: GRACE_MS,
    });

    const t = setTimeout(async () => {
        graceTimers.delete(k);
        if (isUserOnline(roomId, userId)) return; // came back in time
        try {
            await onTimeout(roomId, userId);
        } catch (e) {
            console.error('grace onTimeout error:', (e as Error)?.message);
        }
    }, GRACE_MS);
    graceTimers.set(k, t);
    return true;
}

export async function markPlayerDisconnected(
    io: Server,
    roomId: string,
    userId: string,
) {
    try {
        const room = await prisma.gameRoom.findUnique({
            where: { id: roomId },
            include: { players: true },
        });
        if (!room) return;

        const player = room.players.find(p => p.userId === userId);
        if (!player || player.status === 'LEFT') return;

        await prisma.gamePlayer.update({
            where: { id: player.id },
            data: { status: 'DISCONNECTED' },
        });

        io.to(`room:${roomId}`).emit('presence:disconnected', { userId });

        // If their turn → auto-skip
        if (room.status === 'PLAYING' && room.currentTurnColor === player.color) {
            const activeColors = room.players
                .filter(p => p.rank === null && p.userId !== userId)
                .sort((a, b) => a.seatNumber - b.seatNumber)
                .map(p => p.color);
            const idx = activeColors.indexOf(player.color);
            const next = activeColors[(idx + 1 + activeColors.length) % activeColors.length] ?? null;
            await prisma.gameRoom.update({
                where: { id: roomId },
                data: { currentTurnColor: next, currentDice: null },
            });
            io.to(`room:${roomId}`).emit('turn:changed', {
                currentTurnColor: next,
                currentDice: null,
                reason: 'disconnect-skip',
            });
        }
    } catch (e) {
        console.error('markPlayerDisconnected error:', (e as Error)?.message);
    }
}

export async function markPlayerConnected(
    io: Server,
    roomId: string,
    userId: string,
) {
    try {
        const player = await prisma.gamePlayer.findFirst({
            where: { gameRoomId: roomId, userId },
        });
        if (!player) return;
        if (player.status !== 'CONNECTED') {
            await prisma.gamePlayer.update({
                where: { id: player.id },
                data: { status: 'CONNECTED' },
            });
        }
        io.to(`room:${roomId}`).emit('presence:connected', { userId });
    } catch (e) {
        console.error('markPlayerConnected error:', (e as Error)?.message);
    }
}
