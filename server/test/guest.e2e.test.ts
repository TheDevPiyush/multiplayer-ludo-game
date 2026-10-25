import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';
import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { SignJWT } from 'jose';

// Auth is configured from env at import time.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET = 'test-secret-test-secret-test-secret!';

// Runs against the real database (DATABASE_URL) with throwaway users it deletes afterwards.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('guests', async () => {
    const { prisma } = await import('../lib/prisma');
    const { default: authRouter } = await import('../auth/auth.routes');
    const { default: socialRouter } = await import('../social/social.routes');
    const { default: gameRouter } = await import('../game/game.routes');
    const { default: rtcRouter } = await import('../rtc/rtc.routes');

    const tag = randomUUID().slice(0, 6);
    const guestId = randomUUID();
    const renamedGuestId = randomUUID();
    const member = { id: randomUUID(), username: `zzt_${tag}_member`, provider: 'email' };
    let http: HttpServer;
    let url = '';

    /** A Supabase-shaped access token; guests carry `is_anonymous`. */
    async function token(sub: string, claims: Record<string, unknown> = {}) {
        return new SignJWT({ role: 'authenticated', ...claims })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(sub)
            .setIssuer('https://example.supabase.co/auth/v1')
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
    }
    const guestClaims = { is_anonymous: true, app_metadata: { provider: 'anonymous', providers: ['anonymous'] } };
    /** The same user after linking Google. */
    const linkedClaims = {
        is_anonymous: false,
        email: `zzt_${tag}@example.com`,
        app_metadata: { provider: 'anonymous', providers: ['anonymous', 'google'] },
        user_metadata: { full_name: `Zzt ${tag} Linked`, avatar_url: 'https://example.com/a.png' },
    };

    async function call(jwt: string, method: string, path: string, body?: object) {
        const res = await fetch(`${url}${path}`, {
            method,
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: (await res.json()) as any };
    }

    beforeAll(async () => {
        await prisma.user.create({ data: member });
        const app = express();
        app.use(express.json());
        app.use('/auth', authRouter);
        app.use('/social', socialRouter);
        app.use('/game', gameRouter);
        app.use('/rtc', rtcRouter);
        http = createServer(app);
        await new Promise<void>(r => http.listen(0, r));
        url = `http://localhost:${(http.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise(r => http?.close(r));
        const ids = [guestId, renamedGuestId, member.id];
        const { games } = await import('../game/services');
        await games.stop();
        await prisma.gameRoom.deleteMany({ where: { createdById: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });

    test('a guest gets a guest_ player and can play online', async () => {
        const jwt = await token(guestId, guestClaims);
        const reg = await call(jwt, 'POST', '/auth/register');
        expect(reg.status).toBe(201);
        expect(reg.body.user).toMatchObject({ id: guestId, isGuest: true, provider: 'anonymous' });
        expect(reg.body.user.username).toMatch(/^guest_\d{4}$/);

        const room = await call(jwt, 'POST', '/game/room/create', { maxPlayers: 2 });
        expect(room.status).toBe(201);
    });

    test('friends, invites and voice need a saved account; badges are just empty', async () => {
        const jwt = await token(guestId, guestClaims);
        for (const [method, path] of [['GET', '/social/friends'], ['GET', '/social/users/search?q=zz'], ['POST', `/social/friends/${member.id}`]] as const) {
            const res = await call(jwt, method, path);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('account_required');
        }
        expect((await call(jwt, 'POST', '/rtc/voice-token', { roomId: 'x' })).status).toBe(403);
        expect((await call(jwt, 'GET', '/social/summary')).body.data).toEqual({
            unreadNotifications: 0, incomingRequests: 0, outgoingRequests: 0, friends: 0,
        });
    });

    test('guests are not found in search and cannot be sent requests', async () => {
        const jwt = await token(member.id, { email: 'member@example.com' });
        const found = await call(jwt, 'GET', '/social/users/search?q=guest_');
        expect(found.body.data.map((r: any) => r.user.id)).not.toContain(guestId);
        expect((await call(jwt, 'POST', `/social/friends/${guestId}`)).status).toBe(404);
    });

    test('linking Google keeps the same player: stats stay, the guest name and sign-in are replaced', async () => {
        await prisma.user.update({ where: { id: guestId }, data: { totalGames: 3, totalWins: 2 } });
        const { userRows } = await import('../game/user-cache');
        userRows.delete(guestId);

        const jwt = await token(guestId, linkedClaims);
        // Two requests at once: the upgrade still runs once.
        const [a, b] = await Promise.all([call(jwt, 'GET', '/auth/me'), call(jwt, 'GET', '/auth/me')]);
        expect(a.body.user.username).toBe(b.body.user.username);
        expect(a.body.user).toMatchObject({
            id: guestId, isGuest: false, provider: 'google', totalGames: 3, totalWins: 2, avatarUrl: 'https://example.com/a.png',
        });
        expect(a.body.user.username).toMatch(new RegExp(`^zzt_${tag}_linked`.slice(0, 15)));

        // Now a full account: friends work.
        expect((await call(jwt, 'GET', '/social/friends')).status).toBe(200);
    });

    test('a name the guest picked themselves survives linking', async () => {
        const name = `zzt_${tag}_mine`;
        await prisma.user.create({ data: { id: renamedGuestId, username: name, provider: 'anonymous' } });
        const res = await call(await token(renamedGuestId, linkedClaims), 'GET', '/auth/me');
        expect(res.body.user).toMatchObject({ username: name, isGuest: false, provider: 'google' });
    });
});
