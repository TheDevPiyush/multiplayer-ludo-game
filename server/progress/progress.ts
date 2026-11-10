import type { Prisma } from '../generated/prisma/client.ts';
import { ServiceError } from '../game/game-service';
import type { LiveRoom } from '../game/live-room';
import { GUEST_PROVIDER } from '../lib/providers';
import { prisma } from '../lib/prisma';
import { ADS, PROGRESS } from './config';
import {
    dailyClaim,
    dayOf,
    inviteMatch,
    levelFor,
    liveStreak,
    weekDays,
    missionsFor,
    offlineGameReward,
    onlineGameRewards,
    parseOfflineReport,
    weekOf,
    type GameReward,
    type GameStats,
} from './rules';

/** The client or an open transaction: everything here runs inside a transaction where it writes. */
type Db = Prisma.TransactionClient;

const TX = { timeout: 20_000, maxWait: 10_000 };

/** What a player got from one game, shown on the result screen. */
export interface RewardSummary {
    coins: number;
    xp: number;
    level: number;
    /** Levels gained by this game (each also paid `levelUpCoins`, counted in `coins`). */
    levelsGained: number;
    /** Missions this game completed, ready to claim. */
    missionsDone: string[];
    /** Coins weren't paid because today's cap was reached. */
    capped: boolean;
    /** The game's own coins (without level-ups): what a rewarded ad can double. */
    gameCoins: number;
    /** An invite bonus this game paid, on top of `coins`. */
    invite: InviteBonus | null;
}

/**
 * The invite bonus: `joined` is the new player's (`names` holds the host), `host` the inviter's
 * (`names` holds the new players it was paid for).
 */
export interface InviteBonus {
    coins: number;
    role: 'joined' | 'host';
    names: string[];
}

/** Everything Home shows about a player's progress. */
export async function getProgress(userId: string, now = new Date(), db: Db = prisma) {
    const day = dayOf(now);
    const week = weekDays(day);
    const [user, rows, claims] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { coins: true, xp: true, dailyStreak: true, dailyClaimDay: true, createdAt: true } }),
        db.missionProgress.findMany({ where: { userId, day } }),
        db.coinLedger.findMany({ where: { userId, reason: { in: ['DAILY', 'DAILY_AD', 'DAILY_BONUS'] }, day: { gte: week[0]! } }, select: { day: true, reason: true } }),
    ]);
    if (!user) throw new ServiceError(404, 'Player not found.');
    const level = levelFor(user.xp);
    const next = dailyClaim(user.dailyClaimDay, user.dailyStreak, day);
    const streak = liveStreak(user.dailyClaimDay, user.dailyStreak, day);
    const claimed = new Set(claims.filter(c => c.reason !== 'DAILY_BONUS').map(c => c.day));
    const joined = dayOf(user.createdAt);
    const recoveredThisWeek = claims.filter(c => c.reason === 'DAILY_AD').length >= ADS.rewarded.missedPerWeek;
    const missed = week.filter(d => d < day && d >= joined && !claimed.has(d));
    return {
        day,
        coins: user.coins,
        xp: user.xp,
        level: level.level,
        levelXp: level.into,
        levelXpNeeded: level.needed,
        streak,
        daily: {
            claimedToday: !next,
            /** Today's weekday, Monday 1 … Sunday 7. */
            cycleDay: week.indexOf(day) + 1,
            rewards: PROGRESS.dailyRewards,
            /** A missed day this week a rewarded ad can still collect (the latest), or null. */
            recoverable: recoveredThisWeek ? null : missed[missed.length - 1] ?? null,
            /** Today's reward is in and a rewarded ad can pay it once more. */
            bonusReady: !next && !claims.some(c => c.reason === 'DAILY_BONUS' && c.day === day),
            /** This week, Monday first. `before`: before the player joined (nothing to miss). */
            week: week.map((date, i) => ({
                date,
                coins: PROGRESS.dailyRewards[i]!,
                state: claimed.has(date) ? 'collected' as const
                    : date === day ? 'today' as const
                    : date > day ? 'upcoming' as const
                    : date < joined ? 'before' as const
                    : 'missed' as const,
            })),
        },
        missions: missionsFor(userId, day).map(m => {
            const row = rows.find(r => r.missionId === m.id);
            return {
                id: m.id,
                title: m.title,
                target: m.target,
                coins: m.coins,
                progress: Math.min(row?.progress ?? 0, m.target),
                claimed: !!row?.claimedAt,
            };
        }),
    };
}

export type Progress = Awaited<ReturnType<typeof getProgress>>;

export async function grant(tx: Db, userId: string, amount: number, reason: string, key: string, day: string) {
    await tx.coinLedger.create({ data: { userId, amount, reason, key, day } });
    await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
}

export async function claimDaily(userId: string, now = new Date()): Promise<{ coins: number; progress: Progress }> {
    const day = dayOf(now);
    const coins = await prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { dailyStreak: true, dailyClaimDay: true } });
        if (!user) throw new ServiceError(404, 'Player not found.');
        const claim = dailyClaim(user.dailyClaimDay, user.dailyStreak, day);
        if (!claim) throw new ServiceError(409, "You've already collected today's reward.");
        // Only if nothing changed since the read: a second tap at the same moment finds 0 rows.
        const won = await tx.user.updateMany({
            where: { id: userId, dailyClaimDay: user.dailyClaimDay },
            data: { dailyClaimDay: day, dailyStreak: claim.streak },
        });
        if (won.count === 0) throw new ServiceError(409, "You've already collected today's reward.");
        await grant(tx, userId, claim.coins, 'DAILY', `daily:${userId}:${day}`, day);
        return claim.coins;
    }, TX);
    return { coins, progress: await getProgress(userId, now) };
}

export async function claimMission(userId: string, missionId: string, now = new Date()): Promise<{ coins: number; progress: Progress }> {
    const day = dayOf(now);
    const mission = missionsFor(userId, day).find(m => m.id === missionId);
    if (!mission) throw new ServiceError(404, "That isn't one of today's missions.");
    await prisma.$transaction(async tx => {
        const row = await tx.missionProgress.findUnique({ where: { userId_day_missionId: { userId, day, missionId } } });
        if (!row || row.progress < mission.target) throw new ServiceError(400, "That mission isn't done yet.");
        const won = await tx.missionProgress.updateMany({
            where: { userId, day, missionId, claimedAt: null },
            data: { claimedAt: now },
        });
        if (won.count === 0) throw new ServiceError(409, 'Already collected.');
        await grant(tx, userId, mission.coins, 'MISSION', `mission:${userId}:${day}:${missionId}`, day);
    }, TX);
    return { coins: mission.coins, progress: await getProgress(userId, now) };
}

/** Adds XP; each level gained pays `levelUpCoins`. */
async function addXp(tx: Db, userId: string, xp: number, day: string) {
    const after = await tx.user.update({ where: { id: userId }, data: { xp: { increment: xp } }, select: { xp: true } });
    const from = levelFor(after.xp - xp).level;
    const to = levelFor(after.xp).level;
    for (let level = from + 1; level <= to; level++) {
        await grant(tx, userId, PROGRESS.levelUpCoins, 'LEVEL_UP', `level:${userId}:${level}`, day);
    }
    return { level: to, gained: to - from };
}

/** Moves today's missions on; returns the titles of those this game completed. */
async function advanceMissions(tx: Db, userId: string, day: string, stats: GameStats): Promise<string[]> {
    const done: string[] = [];
    for (const m of missionsFor(userId, day)) {
        const add = m.count(stats);
        if (add <= 0) continue;
        const row = await tx.missionProgress.upsert({
            where: { userId_day_missionId: { userId, day, missionId: m.id } },
            create: { userId, day, missionId: m.id, progress: add },
            update: { progress: { increment: add } },
        });
        if (row.progress >= m.target && row.progress - add < m.target) done.push(m.title);
    }
    return done;
}

/** Pays one game: coins (up to `cap` a day for `reason`), XP and level-ups, mission progress. */
async function payGame(
    tx: Db, userId: string, reward: GameReward, reason: string, key: string, day: string, cap?: number,
): Promise<RewardSummary> {
    let coins = reward.coins;
    if (cap !== undefined) {
        const earned = await tx.coinLedger.aggregate({ where: { userId, reason, day }, _sum: { amount: true } });
        coins = Math.max(0, Math.min(coins, cap - (earned._sum.amount ?? 0)));
    }
    if (coins > 0) await grant(tx, userId, coins, reason, key, day);
    const level = await addXp(tx, userId, reward.xp, day);
    const missionsDone = await advanceMissions(tx, userId, day, reward.stats);
    return {
        coins: coins + level.gained * PROGRESS.levelUpCoins,
        xp: reward.xp,
        level: level.level,
        levelsGained: level.gained,
        missionsDone,
        capped: coins < reward.coins,
        gameCoins: coins,
        invite: null,
    };
}

/**
 * Pays the invite bonus for a finished private game (see `PROGRESS.invite`), inside its
 * transaction. Checks before each write: a unique-key error would abort the whole transaction.
 */
async function payInviteBonus(tx: Db, room: LiveRoom, paid: string[], day: string): Promise<Map<string, InviteBonus>> {
    const out = new Map<string, InviteBonus>();
    if (!room.isPrivate || paid.length < 2) return out;
    const rows = await tx.user.findMany({ where: { id: { in: paid } }, select: { id: true, createdAt: true, provider: true } });
    const users = new Map(rows.map(u => [u.id, { createdAt: u.createdAt, guest: u.provider === GUEST_PROVIDER }]));
    const match = inviteMatch(room, paid, users);
    if (!match) return out;

    const { coins, perWeek } = PROGRESS.invite;
    const nameOf = (id: string) => room.players.find(p => p.userId === id)?.username ?? 'a player';
    const week = weekOf(room.endedAt ? Date.parse(room.endedAt) : Date.now()).start;
    let hostPaidThisWeek = await tx.coinLedger.count({ where: { userId: match.hostId, reason: 'INVITE_HOST', day: { gte: week } } });
    const hostNames: string[] = [];

    for (const id of match.newPlayers) {
        const key = `invite:joined:${id}`;
        if (await tx.coinLedger.findUnique({ where: { key }, select: { id: true } })) continue;
        await grant(tx, id, coins, 'INVITE', key, day);
        out.set(id, { coins, role: 'joined', names: [nameOf(match.hostId)] });
        if (hostPaidThisWeek >= perWeek) continue;
        await grant(tx, match.hostId, coins, 'INVITE_HOST', `invite:host:${match.hostId}:${id}`, day);
        hostPaidThisWeek++;
        hostNames.push(nameOf(id));
    }
    if (hostNames.length > 0) out.set(match.hostId, { coins: coins * hostNames.length, role: 'host', names: hostNames });
    return out;
}

/** Runs in `finishGame`'s transaction, so a game's result and its rewards are saved together. */
export async function payGameRewards(tx: Db, room: LiveRoom): Promise<Map<string, RewardSummary>> {
    const out = new Map<string, RewardSummary>();
    const day = dayOf(room.endedAt ? Date.parse(room.endedAt) : Date.now());
    for (const [userId, reward] of onlineGameRewards(room)) {
        out.set(userId, await payGame(tx, userId, reward, 'GAME', `game:${room.id}:${userId}`, day, PROGRESS.game.dailyCoinCap));
    }
    for (const [userId, bonus] of await payInviteBonus(tx, room, [...out.keys()], day)) out.get(userId)!.invite = bonus;
    return out;
}

/**
 * A Vs Computer game the app reports. The app can't be checked, so it pays little and only
 * `gamesPerDay` times a day. Reporting the same game again changes nothing.
 */
export async function reportOfflineGame(userId: string, body: unknown, now = new Date()) {
    const report = parseOfflineReport(body);
    if (!report) throw new ServiceError(400, 'That game report is not valid.');
    const day = dayOf(now);
    const key = `offline:${userId}:${report.gameId}`;
    const reward = await prisma.$transaction(async tx => {
        if (await tx.coinLedger.findUnique({ where: { key }, select: { id: true } })) return null;
        const today = await tx.coinLedger.count({ where: { userId, reason: 'OFFLINE_GAME', day } });
        if (today >= PROGRESS.offline.gamesPerDay) return null;
        const base = offlineGameReward(report);
        return base ? payGame(tx, userId, base, 'OFFLINE_GAME', key, day) : null;
    }, TX);
    return { reward, progress: await getProgress(userId, now) };
}
