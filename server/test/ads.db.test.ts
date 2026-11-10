import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

// Runs against the real database (DATABASE_URL) with a throwaway user it deletes afterwards.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('rewarded ads (database)', async () => {
    const { prisma } = await import('../lib/prisma');
    const { ADS, PROGRESS } = await import('../progress/config');
    const { grantAdReward } = await import('../ads/rewards');
    const { claimDaily } = await import('../progress/progress');

    // Joined last Monday; Tuesday 10 Nov 2026 is "today".
    const user = { id: randomUUID(), username: `zza_${randomUUID().slice(0, 6)}`, provider: 'anonymous', createdAt: new Date('2026-11-09T01:00:00Z') };
    const now = new Date('2026-11-10T08:00:00Z');
    const games = Array.from({ length: ADS.rewarded.doublePerDay + 1 }, () => randomUUID());

    beforeAll(async () => {
        await prisma.user.create({ data: user });
        // What those games paid (the double reads it from the ledger).
        await prisma.coinLedger.createMany({
            data: games.map(g => ({ userId: user.id, amount: PROGRESS.game.winCoins, reason: 'GAME', key: `game:${g}:${user.id}`, day: '2026-11-10', createdAt: now })),
        });
    });
    afterAll(async () => { await prisma.user.deleteMany({ where: { id: user.id } }); });

    test('doubling pays a game once, a few games a day', async () => {
        const first = await grantAdReward(user.id, 'double', `game:${games[0]}`, now);
        expect(first.coins).toBe(PROGRESS.game.winCoins);
        await expect(grantAdReward(user.id, 'double', `game:${games[0]}`, now)).rejects.toMatchObject({ status: 409 });
        for (const g of games.slice(1, ADS.rewarded.doublePerDay)) await grantAdReward(user.id, 'double', `game:${g}`, now);
        await expect(grantAdReward(user.id, 'double', `game:${games.at(-1)}`, now)).rejects.toMatchObject({ status: 429 });
        await expect(grantAdReward(user.id, 'double', `game:${randomUUID()}`, now)).rejects.toMatchObject({ status: 400 });
    }, 60_000);

    test('a missed day can be collected once a week; the bonus needs today collected first', async () => {
        await expect(grantAdReward(user.id, 'daily_bonus', '2026-11-10', now)).rejects.toMatchObject({ status: 400 });
        const claim = await claimDaily(user.id, now);
        expect(claim.progress.daily.week[0]!.state).toBe('missed');
        expect(claim.progress.daily.recoverable).toBe('2026-11-09');
        expect(claim.progress.daily.bonusReady).toBe(true);

        const missed = await grantAdReward(user.id, 'daily_missed', '2026-11-09', now);
        expect(missed.coins).toBe(PROGRESS.dailyRewards[0]!);
        expect(missed.progress.daily.week[0]!.state).toBe('collected');
        expect(missed.progress.daily.recoverable).toBeNull();
        await expect(grantAdReward(user.id, 'daily_missed', '2026-11-09', now)).rejects.toMatchObject({ status: 409 });
        // Not a future day, nor today.
        await expect(grantAdReward(user.id, 'daily_missed', '2026-11-11', now)).rejects.toMatchObject({ status: 400 });

        const bonus = await grantAdReward(user.id, 'daily_bonus', '2026-11-10', now);
        expect(bonus.coins).toBe(PROGRESS.dailyRewards[1]!);
        expect(bonus.progress.daily.bonusReady).toBe(false);
        await expect(grantAdReward(user.id, 'daily_bonus', '2026-11-10', now)).rejects.toMatchObject({ status: 409 });
    }, 60_000);
});
