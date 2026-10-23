import { describe, expect, test } from 'bun:test';

import { GameService, ServiceError, type GameServiceOptions } from '../game/game-service';
import type { LiveRoom, RoomSync } from '../game/live-room';
import type { Persistence } from '../game/persistence';

function fakeDb() {
    const writes: string[] = [];
    const rooms = new Map<string, LiveRoom>();
    let movesWritten = 0;
    const db: Persistence = {
        async createRoom(room) { writes.push('createRoom'); rooms.set(room.id, structuredClone(room)); },
        async addPlayer() { writes.push('addPlayer'); },
        async removePlayer() { writes.push('removePlayer'); },
        async saveRoom(room) {
            writes.push('saveRoom');
            movesWritten += room.pendingMoves.length;
            room.pendingMoves = [];
        },
        async finishGame(room) {
            writes.push('finishGame');
            movesWritten += room.pendingMoves.length;
            room.pendingMoves = [];
        },
        async loadRoom() { return null; },
        async codeExists() { return false; },
        async getProfile(userId) { return { username: `user_${userId}`, avatarUrl: null }; },
    };
    return { db, writes, moves: () => movesWritten };
}

const fast: GameServiceOptions = {
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
        await games.stop();
    }, 30_000);
});
