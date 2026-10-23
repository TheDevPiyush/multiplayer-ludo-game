import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { SignJWT } from 'jose';
import { io as connect, type Socket } from 'socket.io-client';

import type { RoomSync } from '../game/live-room';
import type { Persistence } from '../game/persistence';

// Auth is configured from env at import time.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET = 'test-secret-test-secret-test-secret!';
const { GameService } = await import('../game/game-service');
const { attachSocketServer, getIO } = await import('../socket/socket-server');

const db: Persistence = {
    async createRoom() {}, async addPlayer() {}, async removePlayer() {},
    async saveRoom() {}, async finishGame() {},
    async loadRoom() { return null; }, async codeExists() { return false; },
    async getProfile(id) { return { username: id, avatarUrl: null }; },
};

const games = new GameService(db, null, { toRoom: (id, ev, p) => getIO()?.to(`room:${id}`).emit(ev, p) }, {
    turnMs: 60_000, afkTurnMs: 60_000, autoDelayMs: 1, flushMs: 60_000, idleEvictMs: 60_000,
    balanceStrength: 0.6, rng: Math.random,
});

let http: HttpServer;
let url = '';
const sockets: Socket[] = [];

async function token(sub: string) {
    return new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuer('https://example.supabase.co/auth/v1')
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
}

async function client(sub: string): Promise<Socket> {
    const t = await token(sub);
    const s = connect(url, { transports: ['websocket'], auth: cb => cb({ token: t }) });
    sockets.push(s);
    await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
    return s;
}

const ask = (s: Socket, ev: string, payload: unknown) =>
    new Promise<any>(res => s.emit(ev, payload, res));

beforeAll(async () => {
    http = createServer();
    attachSocketServer(http, games);
    await new Promise<void>(r => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await games.stop();
    getIO()?.close();
});

test('rejects sockets without a valid token', async () => {
    const s = connect(url, { transports: ['websocket'], auth: { token: 'nope' } });
    sockets.push(s);
    const err = await new Promise<Error>(res => s.on('connect_error', res));
    expect(err.message).toContain('Invalid');
});

test('two players: join, start, roll — both receive the same versioned state', async () => {
    const room = await games.createRoom('alice', { maxPlayers: 2 });
    await games.joinRoom('bob', room.gameCode);

    const [a, b] = await Promise.all([client('alice'), client('bob')]);
    const syncsB: RoomSync[] = [];
    b.on('room:sync', (s: RoomSync) => syncsB.push(s));

    const joinA = await ask(a, 'room:join', { roomId: room.id, gameCode: room.gameCode });
    const joinB = await ask(b, 'room:rejoin', { roomId: room.id, gameCode: room.gameCode });
    expect(joinA.ok && joinB.ok).toBe(true);
    expect(joinB.data.room.players.map((p: any) => p.color)).toEqual(['RED', 'GREEN']);

    expect((await ask(b, 'game:start', { gameCode: room.gameCode })).ok).toBe(false); // not host
    expect((await ask(a, 'game:start', { gameCode: room.gameCode })).ok).toBe(true);
    expect((await ask(b, 'game:roll-dice', { gameCode: room.gameCode })).error).toBe("It's not your turn.");

    const roll = await ask(a, 'game:roll-dice', { gameCode: room.gameCode });
    expect(roll.ok).toBe(true);
    expect(roll.data.diceValue).toBeGreaterThanOrEqual(1);

    await Bun.sleep(50);
    const rolled = syncsB.find(s => s.events.some(e => e.type === 'ROLLED'));
    expect(rolled).toBeDefined();
    expect(rolled!.room.status).toBe('PLAYING');
    for (let i = 1; i < syncsB.length; i++) expect(syncsB[i]!.version).toBeGreaterThan(syncsB[i - 1]!.version);
});
