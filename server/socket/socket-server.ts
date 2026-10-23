import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';

import { ServiceError, type GameService } from '../game/game-service';
import { log } from '../lib/logger';
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

type Ack = (res: unknown) => void;

interface SignalingPayload {
    targetUserId: string;
    roomId: string;
    [k: string]: unknown;
}

/** Max game actions per socket per second — taps are ~2/s at most. */
const ACTIONS_PER_SECOND = 8;

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
        const userId = socketUser(socket)?.id;
        if (!userId) {
            log.warn('socket without user, disconnecting', { socket: socket.id, recovered: socket.recovered });
            socket.disconnect(true);
            return;
        }

        // Personal channel: friend requests, notifications, online status.
        socket.join(`user:${userId}`);

        const joinedRooms = new Set<string>();
        log.info('socket connected', { user: userId, socket: socket.id, recovered: socket.recovered || undefined });

        // Every incoming event at debug level; WebRTC signaling is very chatty.
        socket.onAny((event: string, payload: unknown) => {
            if (event.startsWith('voice:') && event !== 'voice:join' && event !== 'voice:leave') return;
            log.debug(`⇢ ${event}`, { user: userId, ...summarize(payload) });
        });

        let windowStart = Date.now();
        let actionsInWindow = 0;

        const rateLimited = () => {
            const now = Date.now();
            if (now - windowStart >= 1000) {
                windowStart = now;
                actionsInWindow = 0;
            }
            return ++actionsInWindow > ACTIONS_PER_SECOND;
        };

        const roomSnapshot = (roomId: string, room: Parameters<GameService['dto']>[0]) => ({
            room: games.dto(room),
            onlineUserIds: getRoomPresence(roomId),
            voicePeers: Array.from(voiceMembers.get(roomId) ?? []),
        });

        // ─── room:join / room:rejoin ───────────────────────────────
        const onJoin = async (payload: { roomId?: string; gameCode?: string }, ack?: Ack) => {
            try {
                const { roomId } = payload || {};
                if (!roomId) return ack?.({ ok: false, error: 'roomId required' });

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
            if (leaveVoice(roomId, userId)) io!.to(`room:${roomId}`).emit('voice:peer-left', { userId });
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

        socket.on('game:start', gameAction('game:start', async p => {
            await games.startGame(userId, p.gameCode);
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

        // ─── Voice membership + WebRTC signaling ───────────────────
        socket.on('voice:join', (payload: { roomId: string }, ack?: Ack) => {
            const { roomId } = payload || {};
            if (!roomId || !joinedRooms.has(roomId)) return ack?.({ ok: false, error: 'Not in room.' });
            joinVoice(roomId, userId);
            const peers = Array.from(voiceMembers.get(roomId) ?? []).filter(id => id !== userId);
            ack?.({ ok: true, data: { peers } });
            socket.to(`room:${roomId}`).emit('voice:peer-joined', { userId });
        });

        socket.on('voice:leave', (payload: { roomId: string }) => {
            const { roomId } = payload || {};
            if (!roomId) return;
            if (leaveVoice(roomId, userId)) socket.to(`room:${roomId}`).emit('voice:peer-left', { userId });
        });

        socket.on('voice:mute', (payload: { roomId: string; muted: boolean }) => {
            const { roomId, muted } = payload || {};
            if (!roomId || !joinedRooms.has(roomId)) return;
            socket.to(`room:${roomId}`).emit('voice:mute', { userId, muted: !!muted });
        });

        const relaySignal = (eventName: 'voice:offer' | 'voice:answer' | 'voice:ice') =>
            (payload: SignalingPayload) => {
                const { targetUserId, roomId } = payload || {};
                if (!targetUserId || !roomId || !joinedRooms.has(roomId)) return;
                const targets = io!.sockets.adapter.rooms.get(`room:${roomId}`);
                if (!targets) return;
                for (const sid of targets) {
                    const s = io!.sockets.sockets.get(sid);
                    if (s && socketUser(s)?.id === targetUserId) s.emit(eventName, { ...payload, fromUserId: userId });
                }
            };
        socket.on('voice:offer', relaySignal('voice:offer'));
        socket.on('voice:answer', relaySignal('voice:answer'));
        socket.on('voice:ice', relaySignal('voice:ice'));

        // ─── disconnect ────────────────────────────────────────────
        socket.on('disconnect', (reason) => {
            log.info('socket disconnected', { user: userId, socket: socket.id, reason });
            for (const roomId of joinedRooms) {
                if (leaveVoice(roomId, userId)) io!.to(`room:${roomId}`).emit('voice:peer-left', { userId });
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

// ─── Voice room membership ──────────────────────────────────────────

const voiceMembers = new Map<string, Set<string>>(); // roomId → userIds

function joinVoice(roomId: string, userId: string) {
    let set = voiceMembers.get(roomId);
    if (!set) voiceMembers.set(roomId, (set = new Set()));
    set.add(userId);
}

/** Returns true if the user was in voice. */
function leaveVoice(roomId: string, userId: string): boolean {
    const set = voiceMembers.get(roomId);
    if (!set?.delete(userId)) return false;
    if (set.size === 0) voiceMembers.delete(roomId);
    return true;
}
