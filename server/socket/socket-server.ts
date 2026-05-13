import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';

import { socketAuth } from './socket-auth';
import {
    addSocket,
    removeSocket,
    scheduleDisconnect,
    markPlayerConnected,
    markPlayerDisconnected,
    getRoomPresence,
} from './room-presence';
import { prisma } from '../lib/prisma';

let io: Server | null = null;

export function getIO(): Server | null {
    return io;
}

export function broadcastToRoom(roomId: string, event: string, payload: any) {
    if (!io) return;
    io.to(`room:${roomId}`).emit(event, payload);
}

interface JoinPayload {
    roomId: string;
    gameCode: string;
}

interface SignalingPayload {
    targetUserId: string;
    [k: string]: any;
}

export function attachSocketServer(httpServer: HttpServer) {
    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        path: '/socket.io',
        pingInterval: 15_000,
        pingTimeout: 10_000,
    });

    io.use(socketAuth);

    io.on('connection', (socket: Socket) => {
        const userId = socket.user?.id;
        if (!userId) {
            socket.disconnect(true);
            return;
        }

        const joinedRooms = new Set<string>();

        // ─── room:join ──────────────────────────────────────────────
        socket.on('room:join', async (payload: JoinPayload, ack?: (res: any) => void) => {
            try {
                const { roomId, gameCode } = payload || {};
                if (!roomId || !gameCode) {
                    return ack?.({ ok: false, error: 'roomId and gameCode required' });
                }

                const player = await prisma.gamePlayer.findFirst({
                    where: { gameRoomId: roomId, userId },
                });

                if (!player) {
                    return ack?.({ ok: false, error: 'Not a member of this room.' });
                }

                socket.join(`room:${roomId}`);
                joinedRooms.add(roomId);
                addSocket(roomId, userId, socket.id);

                await markPlayerConnected(io!, roomId, userId);

                const room = await prisma.gameRoom.findUnique({
                    where: { id: roomId },
                    include: {
                        players: {
                            include: { user: { select: { username: true, avatarUrl: true } } },
                            orderBy: { seatNumber: 'asc' },
                        },
                    },
                });

                if (!room) {
                    return ack?.({ ok: false, error: 'Room not found.' });
                }

                // Tell newcomer who's online & who's in voice
                const onlineUserIds = getRoomPresence(roomId);
                const voicePeers = Array.from(voiceMembers.get(roomId) ?? []);

                ack?.({
                    ok: true,
                    data: {
                        room,
                        onlineUserIds,
                        voicePeers,
                    },
                });

                // Tell everyone else
                socket.to(`room:${roomId}`).emit('presence:connected', { userId });
            } catch (e) {
                console.error('room:join error:', (e as Error)?.message);
                ack?.({ ok: false, error: 'Failed to join room.' });
            }
        });

        // ─── room:leave (explicit) ──────────────────────────────────
        socket.on('room:leave', async (payload: { roomId: string }, ack?: (res: any) => void) => {
            const { roomId } = payload || {};
            if (!roomId || !joinedRooms.has(roomId)) return ack?.({ ok: false });
            socket.leave(`room:${roomId}`);
            joinedRooms.delete(roomId);
            removeSocket(roomId, userId, socket.id);
            leaveVoice(roomId, userId);
            io!.to(`room:${roomId}`).emit('presence:disconnected', { userId });
            io!.to(`room:${roomId}`).emit('voice:peer-left', { userId });
            ack?.({ ok: true });
        });

        // ─── room:state (re-fetch helper) ───────────────────────────
        socket.on('room:state', async (payload: { roomId: string }, ack?: (res: any) => void) => {
            try {
                const room = await prisma.gameRoom.findUnique({
                    where: { id: payload.roomId },
                    include: {
                        players: {
                            include: { user: { select: { username: true, avatarUrl: true } } },
                            orderBy: { seatNumber: 'asc' },
                        },
                    },
                });
                if (!room) return ack?.({ ok: false, error: 'Room not found.' });
                ack?.({
                    ok: true,
                    data: {
                        room,
                        onlineUserIds: getRoomPresence(payload.roomId),
                        voicePeers: Array.from(voiceMembers.get(payload.roomId) ?? []),
                    },
                });
            } catch (e) {
                ack?.({ ok: false, error: (e as Error)?.message });
            }
        });

        // ─── voice:join / voice:leave ───────────────────────────────
        socket.on('voice:join', (payload: { roomId: string }, ack?: (res: any) => void) => {
            const { roomId } = payload || {};
            if (!roomId || !joinedRooms.has(roomId)) {
                return ack?.({ ok: false, error: 'Not in room.' });
            }
            joinVoice(roomId, userId);
            const peers = Array.from(voiceMembers.get(roomId) ?? []).filter(id => id !== userId);
            ack?.({ ok: true, data: { peers } });
            socket.to(`room:${roomId}`).emit('voice:peer-joined', { userId });
        });

        socket.on('voice:leave', (payload: { roomId: string }) => {
            const { roomId } = payload || {};
            if (!roomId) return;
            leaveVoice(roomId, userId);
            socket.to(`room:${roomId}`).emit('voice:peer-left', { userId });
        });

        // ─── voice:mute (state broadcast) ───────────────────────────
        socket.on('voice:mute', (payload: { roomId: string; muted: boolean }) => {
            const { roomId, muted } = payload || {};
            if (!roomId) return;
            socket.to(`room:${roomId}`).emit('voice:mute', { userId, muted: !!muted });
        });

        // ─── WebRTC signaling (relays to target) ────────────────────
        const relaySignal = (eventName: 'voice:offer' | 'voice:answer' | 'voice:ice') => {
            return (payload: SignalingPayload & { roomId: string }) => {
                const { targetUserId, roomId } = payload || {};
                if (!targetUserId || !roomId) return;
                const targets = io!.sockets.adapter.rooms.get(`room:${roomId}`);
                if (!targets) return;
                for (const sid of targets) {
                    const s = io!.sockets.sockets.get(sid);
                    if (s?.user?.id === targetUserId) {
                        s.emit(eventName, { ...payload, fromUserId: userId });
                    }
                }
            };
        };
        socket.on('voice:offer', relaySignal('voice:offer'));
        socket.on('voice:answer', relaySignal('voice:answer'));
        socket.on('voice:ice', relaySignal('voice:ice'));

        // ─── disconnect ─────────────────────────────────────────────
        socket.on('disconnect', () => {
            for (const roomId of joinedRooms) {
                removeSocket(roomId, userId, socket.id);
                leaveVoice(roomId, userId);
                io!.to(`room:${roomId}`).emit('voice:peer-left', { userId });
                scheduleDisconnect(io!, roomId, userId, async (r, u) => {
                    await markPlayerDisconnected(io!, r, u);
                });
            }
        });
    });

    return io;
}

// ─── Voice room membership ──────────────────────────────────────────

const voiceMembers = new Map<string, Set<string>>(); // roomId → userIds

function joinVoice(roomId: string, userId: string) {
    let set = voiceMembers.get(roomId);
    if (!set) {
        set = new Set();
        voiceMembers.set(roomId, set);
    }
    set.add(userId);
}

function leaveVoice(roomId: string, userId: string) {
    const set = voiceMembers.get(roomId);
    if (!set) return;
    set.delete(userId);
    if (set.size === 0) voiceMembers.delete(roomId);
}
