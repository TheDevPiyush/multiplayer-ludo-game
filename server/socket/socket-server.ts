import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';

import { ServiceError, type GameService } from '../game/game-service';
import { RoomChat } from '../game/room-chat';
import { log } from '../lib/logger';
import { friendCameOnline, friendWentOffline } from '../notifications/friend-online';
import { RateLimiter } from '../lib/rate-limit';
import { blockedEither } from '../social/blocks';
import { socketAuth, socketUser } from './socket-auth';
import {
    addSocket,
    getRoomPresence,
    GRACE_MS,
    onlineCount,
    removeSocket,
    scheduleDisconnect,
} from './room-presence';

let io: Server | null = null;

export function getIO(): Server | null {
    return io;
}

/** Has at least one connected device (the app open, or just backgrounded). */
export function isUserOnline(userId: string): boolean {
    return (io?.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0;
}

type Ack = (res: unknown) => void;

/** Game actions per socket — taps are ~2/s at most. */
const actionLimiter = new RateLimiter(8, 8);
/** room:join / room:state per user — each may load a room from Redis / Postgres. */
const roomLimiter = new RateLimiter(10, 2);

/** Emotes, quick replies and text chat. A chat lock reaches all of the player's devices. */
const chat = new RoomChat((userId, lockedUntil) => {
    io?.to(`user:${userId}`).emit('chat:locked', { lockedUntil });
});

/** A room's recent chat (for reports, which save what the reported player said). */
export function roomChatHistory(roomId: string) {
    return chat.historyFor(roomId);
}

/** `user:<id>` channels of everyone in a block with this user, either way: they don't get each other's emotes or chat. */
async function blockedChannels(userId: string): Promise<string[]> {
    const ids = await blockedEither(userId).catch(() => new Set<string>());
    return [...ids].map(id => `user:${id}`);
}

function corsOrigin(): string | string[] {
    const list = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
    return list?.length ? list : '*';
}

export function attachSocketServer(httpServer: HttpServer, games: GameService) {
    io = new Server(httpServer, {
        cors: { origin: corsOrigin(), methods: ['GET', 'POST'] },
        path: '/socket.io',
        transports: ['websocket'],
        pingInterval: 10_000,
        pingTimeout: 8_000,
        // Socket.IO 4.6+: buffer packets for a briefly dropped client and replay on reconnect.
        connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
    });

    io.use(socketAuth);

    io.on('connection', (socket: Socket) => {
        const user = socketUser(socket);
        const userId = user?.id;
        if (!userId) {
            log.warn('socket without user, disconnecting', { socket: socket.id, recovered: socket.recovered });
            socket.disconnect(true);
            return;
        }

        // Personal channel: friend requests, notifications, online status.
        socket.join(`user:${userId}`);
        // First device in, and not a blip the connection recovered from: tell their friends.
        if (!socket.recovered && io!.sockets.adapter.rooms.get(`user:${userId}`)?.size === 1) {
            friendCameOnline(userId, isUserOnline);
        }

        const joinedRooms = new Set<string>();
        log.info('socket connected', { user: userId, socket: socket.id, recovered: socket.recovered || undefined });

        // Every incoming event at debug level.
        socket.onAny((event: string, payload: unknown) => {
            log.debug(`⇢ ${event}`, { user: userId, ...summarize(payload) });
        });

        const rateLimited = () => !actionLimiter.take(socket.id);

        const roomSnapshot = (roomId: string, room: Parameters<GameService['dto']>[0]) => ({
            room: games.dto(room),
            // Bots have no sockets but are always there.
            onlineUserIds: [...getRoomPresence(roomId), ...games.botIds(room)],
        });

        // ─── room:join / room:rejoin ───────────────────────────────
        const onJoin = async (payload: { roomId?: string; gameCode?: string }, ack?: Ack) => {
            try {
                const { roomId } = payload || {};
                if (!roomId) return ack?.({ ok: false, error: 'roomId required' });
                if (!roomLimiter.take(userId)) return ack?.({ ok: false, error: 'Slow down.' });

                const room = await games.getRoom({ id: roomId });
                if (!room) return ack?.({ ok: false, error: 'Room not found.' });
                if (!games.isMember(room, userId)) return ack?.({ ok: false, error: 'Not a member of this room.' });

                socket.join(`room:${roomId}`);
                joinedRooms.add(roomId);
                const first = addSocket(roomId, userId, socket.id);
                games.setPresence(room, userId, 'CONNECTED');

                ack?.({ ok: true, data: roomSnapshot(roomId, room) });
                log.info('socket room:join', { user: userId, room: room.gameCode, status: room.status });
                if (first) socket.to(`room:${roomId}`).emit('presence:connected', { userId });
            } catch (e) {
                log.error('room:join failed', { user: userId, error: (e as Error)?.message });
                ack?.({ ok: false, error: 'Failed to join room.' });
            }
        };
        socket.on('room:join', onJoin);
        socket.on('room:rejoin', onJoin);

        socket.on('room:state', async (payload: { roomId: string }, ack?: Ack) => {
            if (!roomLimiter.take(userId)) return ack?.({ ok: false, error: 'Slow down.' });
            const room = await games.getRoom({ id: payload?.roomId }).catch(() => null);
            if (!room || !games.isMember(room, userId)) return ack?.({ ok: false, error: 'Room not found.' });
            ack?.({ ok: true, data: roomSnapshot(room.id, room) });
        });

        socket.on('room:leave', (payload: { roomId: string }, ack?: Ack) => {
            const { roomId } = payload || {};
            if (!roomId || !joinedRooms.has(roomId)) return ack?.({ ok: false });
            socket.leave(`room:${roomId}`);
            joinedRooms.delete(roomId);
            if (removeSocket(roomId, userId, socket.id)) {
                io!.to(`room:${roomId}`).emit('presence:disconnected', { userId });
            }
            ack?.({ ok: true });
        });

        // ─── Gameplay ──────────────────────────────────────────────
        const gameAction = (event: string, run: (payload: any) => Promise<unknown>) =>
            async (payload: any, ack?: Ack) => {
                const start = performance.now();
                const fields = () => ({ user: userId, room: payload?.gameCode, ms: (performance.now() - start).toFixed(1) });
                if (rateLimited()) {
                    log.warn(`socket ${event} rate-limited`, fields());
                    return ack?.({ ok: false, error: 'Slow down.' });
                }
                try {
                    const data = await run(payload ?? {});
                    ack?.({ ok: true, data });
                    log.info(`socket ${event} ok`, { ...fields(), ...(data && typeof data === 'object' ? data : {}) });
                } catch (e) {
                    const known = e instanceof ServiceError;
                    (known ? log.warn : log.error)(`socket ${event} rejected`, { ...fields(), error: (e as Error)?.message });
                    ack?.({ ok: false, error: known ? (e as Error).message : 'Something went wrong.' });
                }
            };

        socket.on('room:color', gameAction('room:color', async p => {
            const room = await games.chooseColor(userId, p.gameCode, p.color);
            return { color: room.players.find(x => x.userId === userId)?.color };
        }));
        socket.on('game:start', gameAction('game:start', async p => {
            await games.startGame(userId, p.gameCode);
        }));
        socket.on('room:countdown-cancel', gameAction('room:countdown-cancel', async p => {
            await games.cancelCountdown(userId, p.gameCode);
        }));
        socket.on('game:roll-dice', gameAction('game:roll-dice', async p => {
            const r = await games.act(userId, p.gameCode, { kind: 'ROLL' });
            return { diceValue: r.diceValue };
        }));
        socket.on('game:move-token', gameAction('game:move-token', async p => {
            const token = Number(p.tokenIndex);
            if (!Number.isInteger(token) || token < 0 || token > 3) throw new ServiceError(400, 'tokenIndex must be 0..3.');
            await games.act(userId, p.gameCode, { kind: 'MOVE', token });
        }));
        socket.on('game:skip-turn', gameAction('game:skip-turn', async p => {
            await games.act(userId, p.gameCode, { kind: 'SKIP' });
        }));

        // ─── Reactions & chat ──────────────────────────────────────
        /** The room, when this socket joined it and the user still plays in it. */
        const memberRoom = async (roomId: unknown) => {
            if (typeof roomId !== 'string' || !joinedRooms.has(roomId)) return null;
            const room = await games.getRoom({ id: roomId }).catch(() => null);
            return room && games.isMember(room, userId) ? room : null;
        };

        socket.on('room:react', async (payload: { roomId?: string; kind?: string; id?: string }, ack?: Ack) => {
            if (!(await memberRoom(payload?.roomId))) return ack?.({ ok: false, error: 'Not in this room.' });
            const res = chat.react(userId, payload);
            if (!res.ok) return ack?.(res);
            // The sender shows their own bubble straight away.
            socket.to(`room:${payload.roomId}`).except(await blockedChannels(userId)).emit('room:reaction', { userId, ...res.reaction });
            ack?.({ ok: true });
        });

        socket.on('room:chat-history', async (payload: { roomId?: string }, ack?: Ack) => {
            if (!(await memberRoom(payload?.roomId))) return ack?.({ ok: false, error: 'Not in this room.' });
            const blocked = await blockedEither(userId).catch(() => new Set<string>());
            ack?.({
                ok: true,
                data: {
                    messages: chat.historyFor(payload.roomId!).filter(m => !blocked.has(m.userId)),
                    lockedUntil: chat.lockedUntil(userId),
                    canChat: !user!.isGuest,
                },
            });
        });

        socket.on('room:chat', async (payload: { roomId?: string; text?: string }, ack?: Ack) => {
            if (user!.isGuest) return ack?.({ ok: false, error: 'Save your progress to chat.', code: 'account_required' });
            if (!(await memberRoom(payload?.roomId))) return ack?.({ ok: false, error: 'Not in this room.' });
            const res = chat.say(payload.roomId!, userId, payload.text);
            if (!res.ok) {
                if (res.code) log.info('chat locked', { user: userId });
                return ack?.(res);
            }
            socket.to(`room:${payload.roomId}`).except(await blockedChannels(userId)).emit('room:chat', res.message);
            ack?.({ ok: true, data: res.message });
        });

        // ─── disconnect ────────────────────────────────────────────
        socket.on('disconnect', (reason) => {
            log.info('socket disconnected', { user: userId, socket: socket.id, reason });
            if (!isUserOnline(userId)) friendWentOffline(userId);
            for (const roomId of joinedRooms) {
                if (!removeSocket(roomId, userId, socket.id)) continue;
                io!.to(`room:${roomId}`).emit('presence:disconnecting', { userId, graceMs: GRACE_MS });
                scheduleDisconnect(roomId, userId, () => {
                    io!.to(`room:${roomId}`).emit('presence:disconnected', { userId });
                    void games.getRoom({ id: roomId }).then(room => {
                        if (room) games.setPresence(room, userId, 'DISCONNECTED');
                    });
                });
            }
        });
    });

    games.start(onlineCount);
    return io;
}

/** Small, safe view of an event payload for logs (ids and numbers only). */
function summarize(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
        if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 64)) out[k] = v;
    }
    return out;
}
