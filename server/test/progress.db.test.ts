import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import type { LiveRoom } from '../game/live-room';

// Runs against the real database (DATABASE_URL) with throwaway users it deletes afterwards
// (their ledger and missions go with them). Skipped until the daily-loop migration is applied.
const hasDb = !!process.env.DATABASE_URL;
const migrated = hasDb && await (async () => {
    const { prisma } = await import('../lib/prisma');
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"CoinLedger"') IS NOT NULL AS ok`;
    return rows[0]?.ok === true;
})();

describe.skipIf(!migrated)('daily loop (database)', async () => {
    const { prisma } = await import('../lib/prisma');
    const { PROGRESS } = await import('../progress/config');
    const { claimDaily, claimMission, getProgress, payGameRewards, reportOfflineGame } = await import('../progress/progress');
    const { missionsFor } = await import('../progress/rules');

    const tag = randomUUID().slice(0, 6);
    const users = ['a', 'b'].map(n => ({ id: randomUUID(), username: `zzp_${tag}_${n}`, provider: 'anonymous' }));
    const [a, b] = users as [typeof users[0], typeof users[0]];
    const roomId = randomUUID();
    const now = new Date('2026-11-10T08:00:00Z');
    const tomorrow = new Date('2026-11-11T08:00:00Z');

    beforeAll(async () => {
        await prisma.user.createMany({ data: users });
        await prisma.gameRoom.create({ data: { id: roomId, gameCode: `Z${tag.toUpperCase()}`.slice(0, 6), createdById: a.id, status: 'PLAYING' } });
    });
    afterAll(async () => {
        await prisma.gameRoom.deleteMany({ where: { id: roomId } });
        await prisma.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    });

    test('the daily reward pays once a day and the streak carries on the next day', async () => {
        const first = await claimDaily(a.id, now);
        expect(first.coins).toBe(PROGRESS.dailyRewards[0]!);
        expect(first.progress).toMatchObject({ coins: first.coins, streak: 1, daily: { claimedToday: true, cycleDay: 1 } });

        // Two taps at once: one wins.
        const again = await Promise.allSettled([claimDaily(a.id, now), claimDaily(a.id, now)]);
        expect(again.every(r => r.status === 'rejected')).toBe(true);

        const next = await claimDaily(a.id, tomorrow);
        expect(next.coins).toBe(PROGRESS.dailyRewards[1]!);
        expect(next.progress.streak).toBe(2);
        expect(next.progress.coins).toBe(PROGRESS.dailyRewards[0]! + PROGRESS.dailyRewards[1]!);
    }, 30_000);

    test('a finished game pays once, inside its transaction, with mission progress', async () => {
        const room = {
            id: roomId, isPrivate: true, status: 'FINISHED',
            startedAt: new Date(+now - 10 * 60_000).toISOString(), endedAt: now.toISOString(),
            players: [
                { userId: b.id, color: 'RED', status: 'CONNECTED' },
            ],
            game: { ranking: ['RED', 'GREEN'] },
            moveLog: Array.from({ length: 12 }, () => ['RED', 0, 3, 1, 4, 0]),
            stats: { RED: { captures: 5, home: 4, sixes: 10, finished: true } },
        } as unknown as LiveRoom;

        const before = await getProgress(b.id, now);
        const paid = await prisma.$transaction(tx => payGameRewards(tx, room));
        const reward = paid.get(b.id)!;
        expect(reward.xp).toBe(PROGRESS.game.winXp);
        expect(reward.coins).toBe(PROGRESS.game.winCoins);
        expect(reward.capped).toBe(false);

        const after = await getProgress(b.id, now);
        expect(after.coins - before.coins).toBe(reward.coins);
        expect(after.xp).toBe(PROGRESS.game.winXp);
        // A private win: every mission in the pool moves for this game.
        expect(after.missions.every(m => m.progress > 0)).toBe(true);

        // Paying the same game again breaks on the ledger's unique key and changes nothing.
        await expect(prisma.$transaction(tx => payGameRewards(tx, room))).rejects.toThrow();
        expect((await getProgress(b.id, now)).coins).toBe(after.coins);
    }, 30_000);

    test('a completed mission is claimed once; an unfinished one cannot be', async () => {
        const p = await getProgress(b.id, now);
        const done = p.missions.find(m => m.progress >= m.target);
        const open = p.missions.find(m => m.progress < m.target);
        if (done) {
            const r = await claimMission(b.id, done.id, now);
            expect(r.coins).toBe(done.coins);
            expect(r.progress.missions.find(m => m.id === done.id)!.claimed).toBe(true);
            await expect(claimMission(b.id, done.id, now)).rejects.toMatchObject({ status: 409 });
        }
        if (open) await expect(claimMission(b.id, open.id, now)).rejects.toMatchObject({ status: 400 });
        const notToday = ['play3', 'win2', 'win_online', 'online2', 'capture5', 'home8', 'sixes10', 'private1']
            .find(id => !missionsFor(b.id, p.day).some(m => m.id === id))!;
        await expect(claimMission(b.id, notToday, now)).rejects.toMatchObject({ status: 404 });
    }, 30_000);

    test('offline games pay a few times a day, each game once', async () => {
        const report = (n: number) => ({ gameId: `${tag}-offline-${n}`, won: false, seconds: 300, moves: 20, captures: 0, home: 1, sixes: 2 });
        const first = await reportOfflineGame(a.id, report(0), now);
        expect(first.reward?.coins).toBe(PROGRESS.offline.finishCoins);
        expect((await reportOfflineGame(a.id, report(0), now)).reward).toBeNull();

        for (let i = 1; i < PROGRESS.offline.gamesPerDay; i++) await reportOfflineGame(a.id, report(i), now);
        expect((await reportOfflineGame(a.id, report(99), now)).reward).toBeNull();
        await expect(reportOfflineGame(a.id, { ...report(100), home: 9 }, now)).rejects.toMatchObject({ status: 400 });
    }, 30_000);
});
