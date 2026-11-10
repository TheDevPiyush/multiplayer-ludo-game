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
    const { dayOf, missionsFor } = await import('../progress/rules');
    const { friendsLeaderboard } = await import('../social/leaderboard');

    const tag = randomUUID().slice(0, 6);
    const users = ['a', 'b'].map(n => ({ id: randomUUID(), username: `zzp_${tag}_${n}`, provider: 'anonymous', createdAt: new Date('2026-11-10T01:00:00Z') }));
    const [a, b] = users as [typeof users[0], typeof users[0]];
    const roomId = randomUUID();
    const now = new Date('2026-11-10T08:00:00Z');
    const tomorrow = new Date('2026-11-11T08:00:00Z');
    const DAY = 24 * 60 * 60_000;
    // An invite: a saved host from a month ago, and two players who joined yesterday.
    const host = { id: randomUUID(), username: `zzp_${tag}_h`, provider: 'google', createdAt: new Date(+now - 30 * DAY) };
    const fresh = ['n', 'm'].map(n => ({ id: randomUUID(), username: `zzp_${tag}_${n}`, provider: 'anonymous', createdAt: new Date(+now - DAY) }));
    const everyone = [...users, host, ...fresh];
    const rooms = [roomId, randomUUID(), randomUUID()];

    beforeAll(async () => {
        await prisma.user.createMany({ data: everyone });
        await prisma.gameRoom.create({ data: { id: roomId, gameCode: `Z${tag.toUpperCase()}`.slice(0, 6), createdById: a.id, status: 'PLAYING' } });
    });
    afterAll(async () => {
        await prisma.gameRoom.deleteMany({ where: { id: { in: rooms } } });
        await prisma.user.deleteMany({ where: { id: { in: everyone.map(u => u.id) } } });
    });

    test('the daily reward pays once a day and the streak carries on the next day', async () => {
        // `now` is Tuesday 10 Nov: the week's second reward.
        const first = await claimDaily(a.id, now);
        expect(first.coins).toBe(PROGRESS.dailyRewards[1]!);
        expect(first.progress).toMatchObject({ coins: first.coins, streak: 1, daily: { claimedToday: true, cycleDay: 2 } });
        // Monday is before this test user joined (no "missed"), Tuesday collected, the rest to come.
        expect(first.progress.daily.week.map(d => d.state)).toEqual(['before', 'collected', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);

        // Two taps at once: one wins.
        const again = await Promise.allSettled([claimDaily(a.id, now), claimDaily(a.id, now)]);
        expect(again.every(r => r.status === 'rejected')).toBe(true);

        const next = await claimDaily(a.id, tomorrow);
        expect(next.coins).toBe(PROGRESS.dailyRewards[2]!);
        expect(next.progress.streak).toBe(2);
        expect(next.progress.coins).toBe(PROGRESS.dailyRewards[1]! + PROGRESS.dailyRewards[2]!);

        // Skipping Thursday: Friday pays Friday's coins, and Thursday shows as missed.
        const friday = await claimDaily(a.id, new Date('2026-11-13T08:00:00Z'));
        expect(friday.coins).toBe(PROGRESS.dailyRewards[4]!);
        expect(friday.progress.streak).toBe(1);
        expect(friday.progress.daily.week.map(d => d.state).slice(1, 5)).toEqual(['collected', 'collected', 'missed', 'collected']);
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

    /** A finished 10-minute private game the host won against `guest`. */
    const privateGame = (guest: { id: string; username: string }) => ({
        id: randomUUID(), isPrivate: true, status: 'FINISHED', createdById: host.id,
        startedAt: new Date(+now - 10 * 60_000).toISOString(), endedAt: now.toISOString(),
        players: [
            { userId: host.id, username: host.username, color: 'RED', status: 'CONNECTED' },
            { userId: guest.id, username: guest.username, color: 'GREEN', status: 'CONNECTED' },
        ],
        game: { ranking: ['RED', 'GREEN'] },
        moveLog: Array.from({ length: 12 }, (_, i) => [i % 2 ? 'GREEN' : 'RED', 0, 3, 1, 4, 0]),
        stats: {},
    } as unknown as LiveRoom);

    test('a new player\'s first private game pays both of them once, and the host only a few times a week', async () => {
        const [n, m] = fresh as [typeof fresh[0], typeof fresh[0]];
        const first = await prisma.$transaction(tx => payGameRewards(tx, privateGame(n)));
        expect(first.get(n.id)!.invite).toEqual({ coins: PROGRESS.invite.coins, role: 'joined', names: [host.username] });
        expect(first.get(host.id)!.invite).toEqual({ coins: PROGRESS.invite.coins, role: 'host', names: [n.username] });

        // Their next game together pays no bonus.
        const second = await prisma.$transaction(tx => payGameRewards(tx, privateGame(n)));
        expect(second.get(n.id)!.invite).toBeNull();
        expect(second.get(host.id)!.invite).toBeNull();

        // With this week's host bonuses used up, a new player still gets theirs; the host doesn't.
        await prisma.coinLedger.createMany({
            data: Array.from({ length: PROGRESS.invite.perWeek - 1 }, (_, i) => ({
                userId: host.id, amount: 0, reason: 'INVITE_HOST', key: `test:${tag}:${i}`, day: dayOf(now),
            })),
        });
        const capped = await prisma.$transaction(tx => payGameRewards(tx, privateGame(m)));
        expect(capped.get(m.id)!.invite?.role).toBe('joined');
        expect(capped.get(host.id)!.invite).toBeNull();
    }, 60_000);

    test('the friends leaderboard counts this week\'s wins, not short games', async () => {
        await prisma.friendship.create({ data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED', respondedAt: now } });
        const game = (id: string, code: string, minutes: number, winner: string) => prisma.gameRoom.create({
            data: {
                id, gameCode: code, createdById: a.id, status: 'FINISHED', winnerId: winner,
                startedAt: new Date(+now - minutes * 60_000), endedAt: now,
                players: {
                    create: [
                        { userId: a.id, seatNumber: 0, color: 'RED', rank: winner === a.id ? 1 : 2, joinedAt: new Date(+now - 20 * 60_000) },
                        { userId: b.id, seatNumber: 1, color: 'GREEN', rank: winner === b.id ? 1 : 2, joinedAt: new Date(+now - 20 * 60_000) },
                    ],
                },
            },
        });
        await game(rooms[1]!, `Y${tag.toUpperCase()}`.slice(0, 6), 10, b.id);
        await game(rooms[2]!, `X${tag.toUpperCase()}`.slice(0, 6), 1, a.id);

        const board = await friendsLeaderboard(a.id, now);
        expect(board.week.start).toBe('2026-11-09');
        expect(board.data.map(r => [r.user.id, r.rank, r.wins, r.games, r.you])).toEqual([
            [b.id, 1, 1, 1, false],
            [a.id, 2, 0, 1, true],
        ]);
        // Next week starts empty.
        const later = await friendsLeaderboard(a.id, new Date(+now + 7 * DAY));
        expect(later.data.every(r => r.wins === 0 && r.games === 0)).toBe(true);
    }, 30_000);
});
