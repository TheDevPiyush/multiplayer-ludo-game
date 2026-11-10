import { describe, expect, test } from 'bun:test';

import type { LiveRoom } from '../game/live-room';
import { PROGRESS } from '../progress/config';
import {
    dailyClaim,
    dayOf,
    levelFor,
    liveStreak,
    MISSIONS,
    missionsFor,
    offlineGameReward,
    onlineGameRewards,
    parseOfflineReport,
    previousDay,
} from '../progress/rules';

describe('days', () => {
    test('roll over at midnight India time', () => {
        expect(dayOf(Date.parse('2026-11-10T18:29:00Z'))).toBe('2026-11-10');
        expect(dayOf(Date.parse('2026-11-10T18:30:00Z'))).toBe('2026-11-11');
        expect(previousDay('2026-03-01')).toBe('2026-02-28');
        expect(previousDay('2027-01-01')).toBe('2026-12-31');
    });
});

describe('levels', () => {
    test('each level needs 50 XP more than the last', () => {
        expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 100 });
        expect(levelFor(99).level).toBe(1);
        expect(levelFor(100)).toEqual({ level: 2, into: 0, needed: 150 });
        expect(levelFor(260)).toEqual({ level: 3, into: 10, needed: 200 });
    });
});

describe('daily reward', () => {
    test('a streak grows on consecutive days, wraps after 7, and starts over after a missed day', () => {
        expect(dailyClaim(null, 0, '2026-11-10')).toEqual({ streak: 1, day: 1, coins: PROGRESS.dailyRewards[0] });
        expect(dailyClaim('2026-11-10', 1, '2026-11-10')).toBeNull();
        expect(dailyClaim('2026-11-10', 1, '2026-11-11')).toMatchObject({ streak: 2, day: 2 });
        expect(dailyClaim('2026-11-10', 7, '2026-11-11')).toMatchObject({ streak: 8, day: 1 });
        expect(dailyClaim('2026-11-10', 6, '2026-11-11')).toMatchObject({ day: 7, coins: PROGRESS.dailyRewards[6] });
        expect(dailyClaim('2026-11-08', 5, '2026-11-10')).toMatchObject({ streak: 1, day: 1 });
    });

    test('a streak shows as lost once a whole day passes', () => {
        expect(liveStreak('2026-11-10', 4, '2026-11-10')).toBe(4);
        expect(liveStreak('2026-11-09', 4, '2026-11-10')).toBe(4);
        expect(liveStreak('2026-11-08', 4, '2026-11-10')).toBe(0);
    });
});

describe('missions', () => {
    test('the same three for a player all day, and they vary by player and day', () => {
        const a = missionsFor('user-a', '2026-11-10').map(m => m.id);
        expect(a).toHaveLength(PROGRESS.missionsPerDay);
        expect(new Set(a).size).toBe(a.length);
        expect(missionsFor('user-a', '2026-11-10').map(m => m.id)).toEqual(a);

        const seen = new Set<string>();
        for (let i = 0; i < 40; i++) seen.add(missionsFor(`user-${i}`, `2026-11-${10 + (i % 10)}`).map(m => m.id).join());
        expect(seen.size).toBeGreaterThan(20);
        // Every mission comes up for someone.
        const used = new Set([...Array(200).keys()].flatMap(i => missionsFor(`u${i}`, '2026-11-10').map(m => m.id)));
        expect(used.size).toBe(MISSIONS.length);
    });
});

describe('online game rewards', () => {
    const t0 = Date.parse('2026-11-10T10:00:00Z');
    function room(over: Partial<LiveRoom> = {}): LiveRoom {
        const base = {
            id: 'r1', gameCode: 'ABC123', maxPlayers: 3, isPrivate: false, voiceEnabled: false, createdById: 'a',
            createdAt: new Date(t0).toISOString(), startedAt: new Date(t0).toISOString(),
            endedAt: new Date(t0 + 10 * 60_000).toISOString(), status: 'FINISHED', winnerId: 'a',
            players: [
                { id: '1', userId: 'a', seatNumber: 0, color: 'RED', status: 'CONNECTED', isReady: true, joinedAt: '', username: 'a', avatarUrl: null },
                { id: '2', userId: 'b', seatNumber: 1, color: 'BLUE', status: 'CONNECTED', isReady: true, joinedAt: '', username: 'b', avatarUrl: null },
                { id: '3', userId: 'bot', seatNumber: 2, color: 'GREEN', status: 'CONNECTED', isReady: true, joinedAt: '', username: 'c', avatarUrl: null, isBot: true },
            ],
            game: { ranking: ['RED', 'BLUE', 'GREEN'] },
            version: 1, turnEndsAt: null, timeouts: {},
            moveLog: (['RED', 'BLUE', 'GREEN'] as const).flatMap(c => Array.from({ length: 10 }, () => [c, 0, 3, 1, 4, 0])),
            stats: { RED: { captures: 2, home: 4, sixes: 5, finished: true }, BLUE: { captures: 1, home: 3, sixes: 4 } },
        };
        return { ...base, ...over } as unknown as LiveRoom;
    }

    test('the winner and the other real players are paid; bots are not', () => {
        const r = onlineGameRewards(room());
        expect([...r.keys()].sort()).toEqual(['a', 'b']);
        expect(r.get('a')).toMatchObject({ coins: PROGRESS.game.winCoins, xp: PROGRESS.game.winXp });
        expect(r.get('a')!.stats).toEqual({ online: true, private: false, won: true, captures: 2, home: 4, sixes: 5 });
        expect(r.get('b')).toMatchObject({ coins: PROGRESS.game.finishCoins, stats: { won: false, captures: 1 } });
    });

    test('short games, players with few moves and players who left early get nothing', () => {
        expect(onlineGameRewards(room({ endedAt: new Date(t0 + 60_000).toISOString() })).size).toBe(0);
        expect(onlineGameRewards(room({ status: 'CANCELLED' })).size).toBe(0);

        const fewMoves = room();
        fewMoves.moveLog = fewMoves.moveLog.filter((m, i) => m[0] !== 'BLUE' || i % 10 < 2);
        expect(onlineGameRewards(fewMoves).has('b')).toBe(false);

        const left = room();
        left.players[1]!.status = 'LEFT';
        expect(onlineGameRewards(left).has('b')).toBe(false);
        // Leaving after getting every pawn home still counts.
        left.players[0]!.status = 'LEFT';
        expect(onlineGameRewards(left).has('a')).toBe(true);
    });
});

describe('offline reports', () => {
    const ok = { gameId: 'c0ffee00-1234', won: true, seconds: 400, moves: 30, captures: 2, home: 4, sixes: 6 };

    test('reasonable reports pay a little; impossible ones are refused', () => {
        const r = parseOfflineReport(ok)!;
        expect(offlineGameReward(r)).toMatchObject({ coins: PROGRESS.offline.winCoins, stats: { online: false, won: true } });
        expect(offlineGameReward(parseOfflineReport({ ...ok, won: false, home: 2 })!)!.coins).toBe(PROGRESS.offline.finishCoins);
        expect(offlineGameReward(parseOfflineReport({ ...ok, seconds: 30 })!)).toBeNull();

        expect(parseOfflineReport({ ...ok, home: 2 })).toBeNull(); // a win brings all 4 home
        expect(parseOfflineReport({ ...ok, home: 5 })).toBeNull();
        expect(parseOfflineReport({ ...ok, captures: -1 })).toBeNull();
        expect(parseOfflineReport({ ...ok, moves: 2.5 })).toBeNull();
        expect(parseOfflineReport({ ...ok, gameId: 'x' })).toBeNull();
        expect(parseOfflineReport(null)).toBeNull();
    });
});
