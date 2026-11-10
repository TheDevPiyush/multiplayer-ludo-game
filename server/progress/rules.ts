import { createHash } from 'crypto';

import type { LiveRoom } from '../game/live-room';
import { PROGRESS } from './config';

// Pure rules of the daily loop: no database, so they're easy to test.

/** India is UTC+5:30 all year; days (rewards, missions, caps) roll over at midnight there. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** The India date of `at`, as "2026-11-10". */
export function dayOf(at: Date | number): string {
    return new Date(+at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** The India week (Monday to Sunday) that `at` falls in: its first day and when it starts and ends. */
export function weekOf(at: Date | number): { start: string; startsAt: Date; endsAt: Date } {
    const midnight = Date.parse(`${dayOf(at)}T00:00:00Z`);
    const sinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
    const start = midnight - sinceMonday * DAY_MS;
    return {
        start: new Date(start).toISOString().slice(0, 10),
        startsAt: new Date(start - IST_OFFSET_MS),
        endsAt: new Date(start - IST_OFFSET_MS + 7 * DAY_MS),
    };
}

// ─── Levels ──────────────────────────────────────────────────────────────────

/** XP to go from `level` to the next: 100, 150, 200, … */
export function xpToNext(level: number): number {
    return 100 + 50 * (level - 1);
}

/** Level for a total XP, plus how far into that level the player is. */
export function levelFor(xp: number): { level: number; into: number; needed: number } {
    let level = 1;
    let rest = Math.max(0, xp);
    while (rest >= xpToNext(level)) {
        rest -= xpToNext(level);
        level++;
    }
    return { level, into: rest, needed: xpToNext(level) };
}

// ─── Daily reward ────────────────────────────────────────────────────────────

/**
 * The daily reward for a claim on `today`. The streak carries on from a claim yesterday and
 * starts over otherwise. `day` is the place in the 7-day cycle (1–7).
 */
export function dailyClaim(lastDay: string | null, streak: number, today: string) {
    if (lastDay === today) return null;
    const nextStreak = lastDay === previousDay(today) ? streak + 1 : 1;
    const day = ((nextStreak - 1) % PROGRESS.dailyRewards.length) + 1;
    return { streak: nextStreak, day, coins: PROGRESS.dailyRewards[day - 1]! };
}

/** The streak as it stands today: it's lost once a whole day passes without a claim. */
export function liveStreak(lastDay: string | null, streak: number, today: string): number {
    return lastDay === today || lastDay === previousDay(today) ? streak : 0;
}

// ─── Missions ────────────────────────────────────────────────────────────────

/** What one game did for a player, for missions. */
export interface GameStats {
    online: boolean;
    private: boolean;
    won: boolean;
    captures: number;
    /** Pawns brought home. */
    home: number;
    sixes: number;
}

export interface Mission {
    id: string;
    title: string;
    target: number;
    coins: number;
    count: (s: GameStats) => number;
}

export const MISSIONS: Mission[] = [
    { id: 'play3', title: 'Play 3 games', target: 3, coins: 30, count: () => 1 },
    { id: 'win2', title: 'Win 2 games', target: 2, coins: 50, count: s => (s.won ? 1 : 0) },
    { id: 'win_online', title: 'Win an online game', target: 1, coins: 60, count: s => (s.online && s.won ? 1 : 0) },
    { id: 'online2', title: 'Play 2 online games', target: 2, coins: 40, count: s => (s.online ? 1 : 0) },
    { id: 'capture5', title: 'Capture 5 pawns', target: 5, coins: 40, count: s => s.captures },
    { id: 'home8', title: 'Bring 8 pawns home', target: 8, coins: 40, count: s => s.home },
    { id: 'sixes10', title: 'Roll 10 sixes', target: 10, coins: 30, count: s => s.sixes },
    { id: 'private1', title: 'Finish a game in a private room', target: 1, coins: 50, count: s => (s.online && s.private ? 1 : 0) },
];

/** A player's missions for a day: the same every time it's asked, different per player and day. */
export function missionsFor(userId: string, day: string): Mission[] {
    const rank = (m: Mission) => createHash('sha256').update(`${userId}:${day}:${m.id}`).digest().readUInt32BE(0);
    return [...MISSIONS].sort((a, b) => rank(a) - rank(b)).slice(0, PROGRESS.missionsPerDay);
}

// ─── Games ───────────────────────────────────────────────────────────────────

export interface GameReward {
    coins: number;
    xp: number;
    stats: GameStats;
}

/**
 * What a finished online game pays each real player (before the daily cap). Bots, players who
 * left before finishing, and very short games get nothing.
 */
export function onlineGameRewards(room: LiveRoom): Map<string, GameReward> {
    const out = new Map<string, GameReward>();
    const g = room.game;
    if (room.status !== 'FINISHED' || !g || !room.startedAt || !room.endedAt) return out;
    const seconds = (Date.parse(room.endedAt) - Date.parse(room.startedAt)) / 1000;
    if (seconds < PROGRESS.minGameSeconds) return out;

    for (const p of room.players) {
        if (p.isBot) continue;
        const stats = room.stats?.[p.color];
        if (p.status === 'LEFT' && !stats?.finished) continue;
        const moves = room.moveLog.filter(m => m[0] === p.color).length;
        if (moves < PROGRESS.minMoves) continue;
        const won = g.ranking[0] === p.color;
        out.set(p.userId, {
            coins: won ? PROGRESS.game.winCoins : PROGRESS.game.finishCoins,
            xp: won ? PROGRESS.game.winXp : PROGRESS.game.finishXp,
            stats: {
                online: true,
                private: room.isPrivate,
                won,
                captures: stats?.captures ?? 0,
                home: stats?.home ?? 0,
                sixes: stats?.sixes ?? 0,
            },
        });
    }
    return out;
}

/** A Vs Computer game as the app reports it. */
export interface OfflineReport {
    gameId: string;
    won: boolean;
    seconds: number;
    moves: number;
    captures: number;
    home: number;
    sixes: number;
}

const int = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : NaN);

/** Checks an app's report; null when it can't be a real game. */
export function parseOfflineReport(body: unknown): OfflineReport | null {
    const b = (body ?? {}) as Record<string, unknown>;
    const r = {
        gameId: typeof b.gameId === 'string' ? b.gameId : '',
        won: b.won === true,
        seconds: int(b.seconds),
        moves: int(b.moves),
        captures: int(b.captures),
        home: int(b.home),
        sixes: int(b.sixes),
    };
    if (!/^[A-Za-z0-9-]{8,64}$/.test(r.gameId)) return null;
    if (!(r.seconds >= 0 && r.seconds < 6 * 60 * 60)) return null;
    // A winner brought all 4 pawns home; nobody brings more.
    if (!(r.home >= 0 && r.home <= 4) || (r.won && r.home !== 4)) return null;
    if (!(r.moves >= 0 && r.moves <= 1000 && r.captures >= 0 && r.captures <= 100 && r.sixes >= 0 && r.sixes <= 500)) return null;
    return r;
}

/** What a reported Vs Computer game pays (before the daily count cap). */
export function offlineGameReward(r: OfflineReport): GameReward | null {
    if (r.seconds < PROGRESS.minGameSeconds || r.moves < PROGRESS.minMoves) return null;
    return {
        coins: r.won ? PROGRESS.offline.winCoins : PROGRESS.offline.finishCoins,
        xp: r.won ? PROGRESS.offline.winXp : PROGRESS.offline.finishXp,
        stats: { online: false, private: false, won: r.won, captures: r.captures, home: r.home, sixes: r.sixes },
    };
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export interface InviteUser {
    createdAt: Date;
    guest: boolean;
}

/**
 * Who a finished private game counts as an invite for: the host, and the players new enough to
 * have been brought in by them. `paid` is everyone the game paid (so bots, leavers and short
 * games are already out). The host needs a saved account and to have joined before the new
 * players. Whether each new player already had their bonus is the caller's to check.
 */
export function inviteMatch(
    room: Pick<LiveRoom, 'isPrivate' | 'createdById' | 'endedAt'>,
    paid: Iterable<string>,
    users: Map<string, InviteUser>,
): { hostId: string; newPlayers: string[] } | null {
    if (!room.isPrivate || !room.endedAt) return null;
    const ids = [...paid];
    const host = users.get(room.createdById);
    if (!ids.includes(room.createdById) || !host || host.guest) return null;
    const newSince = Date.parse(room.endedAt) - PROGRESS.invite.newForDays * DAY_MS;
    const newPlayers = ids.filter(id => {
        const u = users.get(id);
        return id !== room.createdById && !!u && +u.createdAt > +host.createdAt && +u.createdAt >= newSince;
    });
    return newPlayers.length > 0 ? { hostId: room.createdById, newPlayers } : null;
}
