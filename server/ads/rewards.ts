import { Prisma } from '../generated/prisma/client.ts';
import { ServiceError } from '../game/game-service';
import { prisma } from '../lib/prisma';
import { ADS, PROGRESS } from '../progress/config';
import { getProgress, grant, type Progress } from '../progress/progress';
import { dayOf, weekDays, weekdayOf } from '../progress/rules';

/**
 * What a rewarded ad pays for. The app sends it as the ad's custom data, `<placement>:<ref>`:
 *   double:game:<roomId>        twice the coins an online game paid (once per game)
 *   double:offline:<gameId>     the same for a Vs Computer game
 *   daily_missed:<date>         collect a missed day of this week's daily reward
 *   daily_bonus:<date>          today's daily reward once more, after collecting it
 */
export type Placement = 'double' | 'daily_missed' | 'daily_bonus';

const ID = /^[A-Za-z0-9-]{8,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCustomData(raw: string | null | undefined): { placement: Placement; ref: string } | null {
    if (!raw) return null;
    const at = raw.indexOf(':');
    const placement = raw.slice(0, at);
    const ref = raw.slice(at + 1);
    if (placement === 'double') {
        const [kind, id] = ref.split(':');
        return (kind === 'game' || kind === 'offline') && id && ID.test(id) ? { placement, ref } : null;
    }
    if (placement === 'daily_missed' || placement === 'daily_bonus') return DATE.test(ref) ? { placement, ref } : null;
    return null;
}

const TX = { timeout: 20_000, maxWait: 10_000 };
const DAY_MS = 24 * 60 * 60_000;

/**
 * Pays one rewarded ad, once: every placement has its own ledger key, so a repeated
 * verification call (or a second ad for the same thing) pays nothing.
 */
export async function grantAdReward(
    userId: string, placement: Placement, ref: string, now = new Date(),
): Promise<{ coins: number; progress: Progress }> {
    const today = dayOf(now);
    let coins = 0;
    try {
        coins = await prisma.$transaction(async tx => {
            const has = async (key: string) => !!(await tx.coinLedger.findUnique({ where: { key }, select: { id: true } }));

            if (placement === 'double') {
                const [kind, id] = ref.split(':') as ['game' | 'offline', string];
                const paidKey = kind === 'game' ? `game:${id}:${userId}` : `offline:${userId}:${id}`;
                const paid = await tx.coinLedger.findUnique({ where: { key: paidKey } });
                if (!paid || paid.amount <= 0 || +now - +paid.createdAt > DAY_MS) {
                    throw new ServiceError(400, "That game didn't earn coins to double.");
                }
                const key = `ad:double:${paidKey}`;
                if (await has(key)) throw new ServiceError(409, 'Already doubled.');
                const used = await tx.coinLedger.count({ where: { userId, reason: 'AD_DOUBLE', day: today } });
                if (used >= ADS.rewarded.doublePerDay) throw new ServiceError(429, `You can double ${ADS.rewarded.doublePerDay} games a day.`);
                await grant(tx, userId, paid.amount, 'AD_DOUBLE', key, today);
                return paid.amount;
            }

            if (placement === 'daily_missed') {
                const user = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
                if (!user) throw new ServiceError(404, 'Player not found.');
                const week = weekDays(today);
                if (!week.includes(ref) || ref >= today || ref < dayOf(user.createdAt)) {
                    throw new ServiceError(400, "That day can't be collected.");
                }
                // The same key as a normal claim of that day: a day is paid once, however it's collected.
                const key = `daily:${userId}:${ref}`;
                if (await has(key)) throw new ServiceError(409, 'That day is already collected.');
                const used = await tx.coinLedger.count({ where: { userId, reason: 'DAILY_AD', day: { gte: week[0]! } } });
                if (used >= ADS.rewarded.missedPerWeek) throw new ServiceError(429, 'You can collect one missed day a week.');
                const amount = PROGRESS.dailyRewards[weekdayOf(ref) - 1]!;
                await grant(tx, userId, amount, 'DAILY_AD', key, ref);
                return amount;
            }

            // daily_bonus
            if (ref !== today) throw new ServiceError(400, "That's not today's reward.");
            if (!(await has(`daily:${userId}:${today}`))) throw new ServiceError(400, "Collect today's reward first.");
            const key = `dailybonus:${userId}:${today}`;
            if (await has(key)) throw new ServiceError(409, "Today's bonus is already collected.");
            const amount = PROGRESS.dailyRewards[weekdayOf(today) - 1]!;
            await grant(tx, userId, amount, 'DAILY_BONUS', key, today);
            return amount;
        }, TX);
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ServiceError(409, 'Already collected.');
        throw e;
    }
    return { coins, progress: await getProgress(userId, now) };
}
