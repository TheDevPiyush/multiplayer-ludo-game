import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

// Runs against the real database (DATABASE_URL) with throwaway rows it deletes afterwards.
// Only touches its own users: it never runs the full cleanup, and the Supabase delete is stubbed.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('inactive guest cleanup', async () => {
    const { prisma } = await import('../lib/prisma');
    const { findInactiveGuests, removeGuest, GUEST_RETENTION_MS } = await import('../auth/guest-cleanup');

    const tag = randomUUID().slice(0, 6);
    const old = new Date(Date.now() - GUEST_RETENTION_MS - 24 * 60 * 60 * 1000);
    const cutoff = new Date(Date.now() - GUEST_RETENTION_MS);
    const user = (n: string, guest: boolean, updatedAt = new Date()) => ({
        id: randomUUID(),
        username: `zzt_${tag}_${n}`,
        provider: guest ? 'anonymous' : 'google',
        updatedAt,
    });
    const gone = user('gone', true, old);
    const playedLately = user('lately', true, old);
    const active = user('active', true);
    const friend = user('friend', false);
    const all = [gone, playedLately, active, friend];
    const roomIds = { alone: randomUUID(), shared: randomUUID(), recent: randomUUID() };

    beforeAll(async () => {
        await prisma.user.createMany({ data: all });
        await prisma.gameRoom.createMany({
            data: [
                { id: roomIds.alone, gameCode: `Z${tag}A`, createdById: gone.id, createdAt: old },
                { id: roomIds.shared, gameCode: `Z${tag}B`, createdById: gone.id, createdAt: old },
                { id: roomIds.recent, gameCode: `Z${tag}C`, createdById: friend.id },
            ],
        });
        await prisma.gamePlayer.createMany({
            data: [
                { gameRoomId: roomIds.alone, userId: gone.id, seatNumber: 0, color: 'RED', joinedAt: old },
                { gameRoomId: roomIds.shared, userId: gone.id, seatNumber: 0, color: 'RED', joinedAt: old },
                { gameRoomId: roomIds.shared, userId: friend.id, seatNumber: 1, color: 'BLUE', joinedAt: old },
                { gameRoomId: roomIds.recent, userId: friend.id, seatNumber: 0, color: 'RED' },
                { gameRoomId: roomIds.recent, userId: playedLately.id, seatNumber: 1, color: 'BLUE' },
            ],
        });
    });

    afterAll(async () => {
        const ids = all.map(u => u.id);
        await prisma.gameRoom.deleteMany({ where: { id: { in: Object.values(roomIds) } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });

    test('only guests with no sign-in or game since the cutoff are picked', async () => {
        const picked = new Set(await findInactiveGuests(cutoff, 100_000));
        expect(picked.has(gone.id)).toBe(true);
        expect(picked.has(playedLately.id)).toBe(false);
        expect(picked.has(active.id)).toBe(false);
        expect(picked.has(friend.id)).toBe(false);
    });

    test('a failed Supabase delete keeps the row', async () => {
        expect(await removeGuest(gone.id, async () => false)).toBe(false);
        expect(await prisma.user.findUnique({ where: { id: gone.id } })).not.toBeNull();
    });

    test('removing a guest drops their solo rooms and hands shared ones to another player', async () => {
        expect(await removeGuest(gone.id, async () => true)).toBe(true);
        expect(await prisma.user.findUnique({ where: { id: gone.id } })).toBeNull();
        expect(await prisma.gameRoom.findUnique({ where: { id: roomIds.alone } })).toBeNull();
        const shared = await prisma.gameRoom.findUnique({ where: { id: roomIds.shared }, include: { players: true } });
        expect(shared?.createdById).toBe(friend.id);
        expect(shared?.players.map(p => p.userId)).toEqual([friend.id]);
    });
});
