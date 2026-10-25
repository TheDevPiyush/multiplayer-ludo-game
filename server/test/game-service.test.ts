import { describe, expect, test } from 'bun:test';

import { cryptoRng, GameService, ServiceError, type GameServiceOptions } from '../game/game-service';
import type { LiveRoom, RoomSync } from '../game/live-room';
import type { Persistence } from '../game/persistence';

function fakeDb() {
    const writes: string[] = [];
    const rooms = new Map<string, LiveRoom>();
    let movesWritten = 0;
    let loads = 0;
    const db: Persistence = {
        async createRoom(room) { writes.push('createRoom'); rooms.set(room.id, structuredClone(room)); },
        async addPlayer() { writes.push('addPlayer'); },
        async removePlayer() { writes.push('removePlayer'); },
        async setPlayerColors() { writes.push('setPlayerColors'); },
        async saveRoom() { writes.push('saveRoom'); },
        async finishGame(room) {
            writes.push('finishGame');
            movesWritten = room.moveLog.length;
        },
        async loadRoom() { loads++; return null; },
        async codeExists() { return false; },
        async getProfile(userId) { return { username: `user_${userId}`, avatarUrl: null }; },
    };
    return { db, writes, moves: () => movesWritten, loads: () => loads };
}

const fast: Partial<GameServiceOptions> = {
    turnMs: 5,
    afkTurnMs: 2,
    autoDelayMs: 1,
    flushMs: 60_000,
    idleEvictMs: 60_000,
    balanceStrength: 0.6,
    rng: Math.random,
};

function setup(opts = fast) {
    const f = fakeDb();
    const syncs: RoomSync[] = [];
    const games = new GameService(f.db, null, {
        toRoom: (_id, event, payload) => { if (event === 'room:sync') syncs.push(payload as RoomSync); },
    }, opts);
    return { games, syncs, ...f };
}

describe('cryptoRng', () => {
    test('returns floats in [0, 1) and spreads across the range', () => {
        let min = 1;
        let max = 0;
        for (let i = 0; i < 20_000; i++) {
            const x = cryptoRng();
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(1);
            min = Math.min(min, x);
            max = Math.max(max, x);
        }
        expect(min).toBeLessThan(0.01);
        expect(max).toBeGreaterThan(0.99);
    });

    test('drives real dice rolls', async () => {
        const { games } = setup({ ...fast, turnMs: 60_000, rng: cryptoRng });
        const room = await games.createRoom('a', { maxPlayers: 2 });
        await games.joinRoom('b', room.gameCode);
        await games.startGame('a', room.gameCode);
        const r = await games.act('a', room.gameCode, { kind: 'ROLL' });
        expect(r.diceValue).toBeGreaterThanOrEqual(1);
        expect(r.diceValue).toBeLessThanOrEqual(6);
        await games.stop();
    });
});

describe('lobby', () => {
    test('seat freed by a leaver is reused without collisions', async () => {
        const { games } = setup();
        const room = await games.createRoom('a', { maxPlayers: 4 });
        await games.joinRoom('b', room.gameCode);
        await games.joinRoom('c', room.gameCode);
        await games.leaveRoom('b', room.gameCode);
        const { player } = await games.joinRoom('d', room.gameCode);
        const seats = room.players.map(p => p.seatNumber);
        const colors = room.players.map(p => p.color);
        expect(new Set(seats).size).toBe(3);
        expect(new Set(colors).size).toBe(3);
        expect(player.seatNumber).toBe(1);
    });

    test('two-player rooms seat RED vs GREEN', async () => {
        const { games } = setup();
        const room = await games.createRoom('a', { maxPlayers: 2 });
        await games.joinRoom('b', room.gameCode.toLowerCase());
        expect(room.players.map(p => p.color)).toEqual(['RED', 'GREEN']);
        await expect(games.joinRoom('c', room.gameCode)).rejects.toThrow(ServiceError);
    });

    test('public room list: only public, waiting rooms with a free seat', async () => {
        const { games } = setup();
        const open = await games.createRoom('a', { maxPlayers: 2, isPrivate: false });
        const priv = await games.createRoom('b', { maxPlayers: 2, isPrivate: true });
        const full = await games.createRoom('c', { maxPlayers: 2, isPrivate: false });
        await games.joinRoom('d', full.gameCode);
        const started = await games.createRoom('e', { maxPlayers: 3, isPrivate: false });
        await games.joinRoom('f', started.gameCode);
        await games.startGame('e', started.gameCode);

        expect(games.openPublicRooms().map(r => r.gameCode)).toEqual([open.gameCode]);
        expect(priv.isPrivate).toBe(true);
    });

    test('finished or cancelled rooms cannot be joined, even by their own players', async () => {
        const { games } = setup();
        const done = await games.createRoom('a', { maxPlayers: 2 });
        await games.joinRoom('b', done.gameCode);
        done.status = 'FINISHED';
        for (const user of ['a', 'b', 'c']) {
            await expect(games.joinRoom(user, done.gameCode)).rejects.toThrow('This game has already finished.');
        }

        const closed = await games.createRoom('a', { maxPlayers: 2 });
        await games.cancelRoom('a', closed.gameCode);
        await expect(games.joinRoom('a', closed.gameCode)).rejects.toThrow('This room was closed by the host.');

        const live = await games.createRoom('a', { maxPlayers: 3 });
        await games.joinRoom('b', live.gameCode);
        await games.startGame('a', live.gameCode);
        await expect(games.joinRoom('c', live.gameCode)).rejects.toThrow('This game has already started.');
        // A player of a running game can still get back in.
        expect((await games.joinRoom('b', live.gameCode)).player.userId).toBe('b');
    });
});

describe('gameplay', () => {
    test('double roll is rejected — actions cannot interleave', async () => {
        const { games } = setup({ ...fast, turnMs: 60_000 });
        const room = await games.createRoom('a', { maxPlayers: 2 });
        await games.joinRoom('b', room.gameCode);
        await games.startGame('a', room.gameCode);
        const results = await Promise.allSettled([
            games.act('a', room.gameCode, { kind: 'ROLL' }),
            games.act('a', room.gameCode, { kind: 'ROLL' }),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        await games.stop();
    });

    test('versions strictly increase and every sync carries the full room', async () => {
        const { games, syncs } = setup({ ...fast, turnMs: 60_000 });
        const room = await games.createRoom('a', { maxPlayers: 2 });
        await games.joinRoom('b', room.gameCode);
        await games.startGame('a', room.gameCode);
        await games.act('a', room.gameCode, { kind: 'ROLL' });
        for (let i = 1; i < syncs.length; i++) expect(syncs[i]!.version).toBeGreaterThan(syncs[i - 1]!.version);
        expect(syncs.at(-1)!.room.players).toHaveLength(2);
        await games.stop();
    });

    test('a full game on autopilot touches the database only a handful of times', async () => {
        const { games, writes, moves, syncs } = setup();
        const room = await games.createRoom('a', { maxPlayers: 4 });
        for (const u of ['b', 'c', 'd']) await games.joinRoom(u, room.gameCode);
        await games.startGame('a', room.gameCode);

        // Nobody is connected → every turn runs on the short AFK timer.
        const deadline = Date.now() + 20_000;
        while (room.status !== 'FINISHED' && Date.now() < deadline) await Bun.sleep(5);
        await Bun.sleep(10);

        expect(room.status).toBe('FINISHED');
        expect(room.winnerId).not.toBeNull();
        const actions = syncs.filter(s => s.events.some(e => e.type === 'ROLLED' || e.type === 'MOVED')).length;
        console.log(`4-player game: ${actions} realtime updates, ${moves()} moves logged, DB writes: ${JSON.stringify(writes)}`);
        // create + 3 joins + start + one final transaction.
        expect(writes).toEqual(['createRoom', 'addPlayer', 'addPlayer', 'addPlayer', 'saveRoom', 'finishGame']);
        expect(moves()).toBeGreaterThan(20);
        // Compact entries: [color, token, dice, from, to, at].
        const [color, token, dice, from, to] = room.moveLog[0]!;
        expect(['RED', 'BLUE', 'GREEN', 'YELLOW']).toContain(color);
        expect(token).toBeGreaterThanOrEqual(0);
        expect(dice).toBeGreaterThanOrEqual(1);
        expect(to).toBeGreaterThan(from);
        await games.stop();
    }, 30_000);
});

describe('nobody watching', () => {
    async function twoPlayerGame(online: { count: number }) {
        const t = setup({ ...fast, unwatchedPauseMs: 30, abandonMs: 150 });
        t.games.start(() => online.count);
        const room = await t.games.createRoom('a', { maxPlayers: 2 });
        await t.games.joinRoom('b', room.gameCode);
        await t.games.startGame('a', room.gameCode);
        return { ...t, room };
    }

    test('autopilot stops once everyone has been gone a while, and a returning player resumes it', async () => {
        const online = { count: 0 };
        const { games, room } = await twoPlayerGame(online);

        await Bun.sleep(80);
        expect(games.stats().paused).toBe(1);
        expect(room.turnEndsAt).toBeNull();
        const frozenAt = room.version;
        await Bun.sleep(40);
        expect(room.version).toBe(frozenAt);

        online.count = 1;
        games.setPresence(room, 'a', 'CONNECTED');
        expect(games.stats().paused).toBe(0);
        expect(room.version).toBeGreaterThan(frozenAt);
        await Bun.sleep(20);
        expect(room.status).toBe('PLAYING');
        await games.stop();
    });

    test('an abandoned game ends as cancelled without a final result or stats', async () => {
        const online = { count: 0 };
        const { games, room, writes, syncs } = await twoPlayerGame(online);
        const closed: string[] = [];
        games.onRoomClosed = r => closed.push(r.status);

        await Bun.sleep(200);
        await games.flush();
        await Bun.sleep(5);

        expect(room.status).toBe('CANCELLED');
        expect(room.endedAt).not.toBeNull();
        expect(writes).not.toContain('finishGame');
        expect(writes.at(-1)).toBe('saveRoom');
        expect(closed).toEqual(['CANCELLED']);
        expect(syncs.at(-1)!.events).toEqual([{ type: 'CANCELLED', reason: 'abandoned' }]);
        await games.stop();
    });
});

describe('lookups', () => {
    test('a room that does not exist is only looked up once in a while', async () => {
        const { games, loads } = setup();
        expect(await games.getRoom({ gameCode: 'NOPE23' })).toBeNull();
        expect(await games.getRoom({ gameCode: 'NOPE23' })).toBeNull();
        expect(await games.getRoom({ id: 'missing-id' })).toBeNull();
        expect(loads()).toBe(2);
    });
});

describe('RateLimiter', () => {
    test('allows a burst, then refills over time', async () => {
        const { RateLimiter } = await import('../lib/rate-limit');
        const limiter = new RateLimiter(2, 20);
        expect(limiter.take('u')).toBe(true);
        expect(limiter.take('u')).toBe(true);
        expect(limiter.take('u')).toBe(false);
        expect(limiter.take('other')).toBe(true);
        await Bun.sleep(60);
        expect(limiter.take('u')).toBe(true);
    });
});

describe('lobby colors', () => {
    const colorOf = (room: LiveRoom, user: string) => room.players.find(p => p.userId === user)?.color;
    const unique = (room: LiveRoom) => new Set(room.players.map(p => p.color)).size === room.players.length;

    test('a picked color is locked for everyone else and freed when its holder moves or leaves', async () => {
        const { games, syncs } = setup();
        const room = await games.createRoom('a', { maxPlayers: 4 });
        for (const u of ['b', 'c']) await games.joinRoom(u, room.gameCode);
        expect(room.players.map(p => p.color)).toEqual(['RED', 'BLUE', 'GREEN']);

        await games.chooseColor('b', room.gameCode, 'YELLOW');
        expect(colorOf(room, 'b')).toBe('YELLOW');
        expect(syncs.at(-1)!.events).toEqual([{
            type: 'COLORS_CHANGED', byUserId: 'b', changes: [{ userId: 'b', from: 'BLUE', to: 'YELLOW' }],
        }]);
        expect(syncs.at(-1)!.room.players.find(p => p.userId === 'b')!.color).toBe('YELLOW');

        // Taken → refused; the color b just released → fine.
        await expect(games.chooseColor('c', room.gameCode, 'YELLOW')).rejects.toMatchObject({ status: 409 });
        await games.chooseColor('c', room.gameCode, 'BLUE');
        expect(colorOf(room, 'c')).toBe('BLUE');

        // Leaving releases the color; the next joiner can have it.
        await games.leaveRoom('b', room.gameCode);
        await games.chooseColor('c', room.gameCode, 'YELLOW');
        await games.joinRoom('d', room.gameCode);
        expect(unique(room)).toBe(true);
        expect(room.players).toHaveLength(3);
        await games.stop();
    });

    test('two players racing for the same color: exactly one gets it', async () => {
        const { games } = setup();
        const room = await games.createRoom('a', { maxPlayers: 4 });
        await games.joinRoom('b', room.gameCode);
        const results = await Promise.allSettled([
            games.chooseColor('a', room.gameCode, 'YELLOW'),
            games.chooseColor('b', room.gameCode, 'YELLOW'),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        expect(unique(room)).toBe(true);
        await games.stop();
    });

    test('2-player rooms stay in opposite corners', async () => {
        const { games } = setup();
        const room = await games.createRoom('a', { maxPlayers: 2 });
        await games.chooseColor('a', room.gameCode, 'BLUE');
        await games.joinRoom('b', room.gameCode);
        expect(colorOf(room, 'b')).toBe('YELLOW');

        await games.chooseColor('b', room.gameCode, 'RED');
        expect([colorOf(room, 'a'), colorOf(room, 'b')]).toEqual(['GREEN', 'RED']);
        await expect(games.chooseColor('a', room.gameCode, 'RED')).rejects.toMatchObject({ status: 409 });
        await games.stop();
    });

    test('colors are fixed once the game starts, and the game uses the picked ones', async () => {
        const { games } = setup({ ...fast, turnMs: 60_000 });
        const room = await games.createRoom('a', { maxPlayers: 3 });
        await games.joinRoom('b', room.gameCode);
        await games.chooseColor('b', room.gameCode, 'YELLOW');
        await games.startGame('a', room.gameCode);
        expect(room.game!.players.map(p => p.color)).toEqual(['RED', 'YELLOW']);
        await expect(games.chooseColor('a', room.gameCode, 'GREEN')).rejects.toMatchObject({ status: 400 });
        await expect(games.chooseColor('a', room.gameCode, 'PINK')).rejects.toMatchObject({ status: 400 });
        await games.stop();
    });

    test('a color that could not be saved is given back', async () => {
        const t = setup();
        t.db.setPlayerColors = async () => { throw new Error('db down'); };
        const room = await t.games.createRoom('a', { maxPlayers: 4 });
        await expect(t.games.chooseColor('a', room.gameCode, 'GREEN')).rejects.toMatchObject({ status: 503 });
        expect(colorOf(room, 'a')).toBe('RED');
        expect(t.syncs.at(-1)!.room.players[0]!.color).toBe('RED');
        await t.games.stop();
    });
});
