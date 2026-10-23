import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';
import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { SignJWT } from 'jose';
import { io as connect, type Socket } from 'socket.io-client';

// Auth is configured from env at import time.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET = 'test-secret-test-secret-test-secret!';

// Runs against the real database (DATABASE_URL) with throwaway users it deletes afterwards.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('friends & notifications', async () => {
    const { prisma } = await import('../lib/prisma');
    const { default: socialRouter } = await import('../social/social.routes');
    const { attachSocketServer } = await import('../socket/socket-server');
    const { GameService } = await import('../game/game-service');

    const tag = randomUUID().slice(0, 6);
    const alice = { id: randomUUID(), username: `zzt_${tag}_alice` };
    const bob = { id: randomUUID(), username: `zzt_${tag}_bob` };
    const extraIds: string[] = [];

    let http: HttpServer;
    let url = '';
    let bobSocket: Socket;

    async function token(sub: string) {
        return new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(sub)
            .setIssuer('https://example.supabase.co/auth/v1')
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
    }

    async function api(as: string, method: string, path: string, body?: object) {
        const res = await fetch(`${url}/social${path}`, {
            method,
            headers: { Authorization: `Bearer ${await token(as)}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: (await res.json()) as any };
    }

    beforeAll(async () => {
        await prisma.user.createMany({ data: [alice, bob] });
        const app = express();
        app.use(express.json());
        app.use('/social', socialRouter);
        http = createServer(app);
        const db = {} as ConstructorParameters<typeof GameService>[0];
        attachSocketServer(http, new GameService(db, null, { toRoom: () => {} }));
        await new Promise<void>(r => http.listen(0, r));
        url = `http://localhost:${(http.address() as AddressInfo).port}`;

        const t = await token(bob.id);
        bobSocket = connect(url, { transports: ['websocket'], auth: cb => cb({ token: t }) });
        await new Promise<void>((res, rej) => { bobSocket.on('connect', () => res()); bobSocket.on('connect_error', rej); });
    });

    afterAll(async () => {
        bobSocket?.disconnect();
        await new Promise(r => http?.close(r));
        const ids = [alice.id, bob.id, ...extraIds];
        const { games } = await import('../game/services');
        await games.stop();
        await prisma.gameRoom.deleteMany({ where: { createdById: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });

    test('search finds players by username prefix, not yourself', async () => {
        const { body } = await api(alice.id, 'GET', `/users/search?q=@zzt_${tag}`);
        expect(body.data.map((r: any) => r.user.username)).toEqual([bob.username]);
        expect(body.data[0].relation).toBe('none');
    });

    test('request → live notification → accept → friends on both sides', async () => {
        const update = new Promise<any>(res => bobSocket.once('social:update', res));
        expect((await api(alice.id, 'POST', `/friends/${bob.id}`)).body.relation).toBe('outgoing');
        expect(await update).toEqual({ reason: 'request', fromUserId: alice.id });

        // Second tap is a no-op.
        expect((await api(alice.id, 'POST', `/friends/${bob.id}`)).body.relation).toBe('outgoing');

        const summary = (await api(bob.id, 'GET', '/summary')).body.data;
        expect(summary).toEqual({ unreadNotifications: 1, incomingRequests: 1, outgoingRequests: 0, friends: 0 });

        const requests = (await api(bob.id, 'GET', '/requests')).body;
        expect(requests.data.map((r: any) => [r.direction, r.user.id])).toEqual([['incoming', alice.id]]);
        expect(requests.nextCursor).toBeNull();

        const notes = (await api(bob.id, 'GET', '/notifications')).body.data;
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ type: 'FRIEND_REQUEST', relation: 'incoming', actor: { id: alice.id } });

        expect((await api(bob.id, 'POST', `/friends/${alice.id}/accept`)).body.relation).toBe('friends');

        const bobFriends = (await api(bob.id, 'GET', '/friends')).body.data;
        expect(bobFriends.map((f: any) => f.user.id)).toEqual([alice.id]);
        expect(bobFriends[0].online).toBe(false);
        // Bob's socket is connected, so Alice sees him online.
        const aliceFriends = (await api(alice.id, 'GET', '/friends')).body.data;
        expect(aliceFriends[0]).toMatchObject({ user: { id: bob.id }, online: true });

        const aliceNotes = (await api(alice.id, 'GET', '/notifications')).body.data;
        expect(aliceNotes[0]).toMatchObject({ type: 'FRIEND_ACCEPTED', relation: 'friends', actor: { id: bob.id } });

        await api(alice.id, 'POST', '/notifications/read');
        expect((await api(alice.id, 'GET', '/summary')).body.data.unreadNotifications).toBe(0);
    });

    test('unfriending removes the link and its notifications', async () => {
        expect((await api(bob.id, 'DELETE', `/friends/${alice.id}`)).body.relation).toBe('none');
        expect((await api(alice.id, 'GET', '/friends')).body.data).toEqual([]);
        expect((await api(alice.id, 'GET', '/notifications')).body.data).toEqual([]);
    });

    test('a request to someone who already asked you becomes a friendship', async () => {
        await api(alice.id, 'POST', `/friends/${bob.id}`);
        expect((await api(bob.id, 'POST', `/friends/${alice.id}`)).body.relation).toBe('friends');
        const search = (await api(alice.id, 'GET', `/users/search?q=${bob.username}`)).body.data;
        expect(search[0].relation).toBe('friends');
    });

    test('lists are paged with a cursor, without gaps or repeats', async () => {
        // Alice: friends with Bob (from the test above) + 3 more; 2 received and 1 sent request.
        const extra = Array.from({ length: 6 }, (_, i) => ({ id: randomUUID(), username: `zzt_${tag}_x${i}` }));
        await prisma.user.createMany({ data: extra });
        extraIds.push(...extra.map(u => u.id));
        for (const u of extra.slice(0, 3)) {
            await api(alice.id, 'POST', `/friends/${u.id}`);
            await api(u.id, 'POST', `/friends/${alice.id}/accept`);
        }
        await api(extra[3]!.id, 'POST', `/friends/${alice.id}`);
        await api(extra[4]!.id, 'POST', `/friends/${alice.id}`);
        await api(alice.id, 'POST', `/friends/${extra[5]!.id}`);

        const walk = async (path: string, limit: number) => {
            const pages: any[][] = [];
            let cursor: string | null = null;
            do {
                const q: string = `${path}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
                const { body } = await api(alice.id, 'GET', q);
                pages.push(body.data);
                cursor = body.nextCursor;
            } while (cursor && pages.length < 10);
            return pages;
        };

        const friendPages = await walk('/friends', 2);
        expect(friendPages.map(p => p.length)).toEqual([2, 2]);
        const friendIds = friendPages.flat().map((f: any) => f.user.id);
        expect(new Set(friendIds)).toEqual(new Set([bob.id, ...extra.slice(0, 3).map(u => u.id)]));
        // Newest friendship first.
        expect(friendIds[0]).toBe(extra[2]!.id);

        // Received (newest first) come before sent, across page boundaries.
        const requestPages = await walk('/requests', 2);
        expect(requestPages.flat().map((r: any) => [r.direction, r.user.id])).toEqual([
            ['incoming', extra[4]!.id],
            ['incoming', extra[3]!.id],
            ['outgoing', extra[5]!.id],
        ]);

        const notePages = await walk('/notifications', 2);
        const noteIds = notePages.flat().map((n: any) => n.id);
        expect(new Set(noteIds).size).toBe(noteIds.length);
        expect(noteIds.length).toBe(6); // 3 accepted + 2 requests + 1 from Bob's mutual add earlier

        const summary = (await api(alice.id, 'GET', '/summary')).body.data;
        expect(summary).toMatchObject({ incomingRequests: 2, outgoingRequests: 1, friends: 4 });
    });

    test('cannot add yourself or an unknown player', async () => {
        expect((await api(alice.id, 'POST', `/friends/${alice.id}`)).status).toBe(400);
        expect((await api(alice.id, 'POST', `/friends/${randomUUID()}`)).status).toBe(404);
    });

    test('room invites reach friends live, only friends, one per room', async () => {
        const { games } = await import('../game/services');
        const room = await games.createRoom(alice.id, { maxPlayers: 4 });
        const invite = (userId: string) => api(alice.id, 'POST', '/invites', { gameCode: room.gameCode, userId });

        const update = new Promise<any>(res => bobSocket.once('social:update', res));
        expect((await invite(bob.id)).status).toBe(200);
        expect(await update).toMatchObject({ reason: 'invite', fromUserId: alice.id, gameCode: room.gameCode, username: alice.username });
        await invite(bob.id);

        const invites = (await api(bob.id, 'GET', '/notifications')).body.data.filter((n: any) => n.type === 'ROOM_INVITE');
        expect(invites).toHaveLength(1);
        expect(invites[0]).toMatchObject({ gameCode: room.gameCode, actor: { id: alice.id }, readAt: null, roomOpen: true });

        // Not friends (only a pending request) → refused.
        expect((await invite(extraIds[5]!)).status).toBe(403);
        // Bob can't invite people to a room he isn't in.
        expect((await api(bob.id, 'POST', '/invites', { gameCode: room.gameCode, userId: alice.id })).status).toBe(404);

        // Once the room is closed the invite says so.
        await games.cancelRoom(alice.id, room.gameCode);
        const after = (await api(bob.id, 'GET', '/notifications')).body.data.find((n: any) => n.type === 'ROOM_INVITE');
        expect(after.roomOpen).toBe(false);
    });
});
