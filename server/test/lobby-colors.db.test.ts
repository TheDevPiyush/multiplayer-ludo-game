import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

// Runs against the real database (DATABASE_URL) with throwaway users it deletes afterwards:
// checks color changes land in Postgres in an order its unique (room, color) index accepts.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('lobby colors in Postgres', async () => {
    const { prisma } = await import('../lib/prisma');
    const { prismaPersistence } = await import('../game/persistence');
    const { GameService } = await import('../game/game-service');

    const tag = randomUUID().slice(0, 6);
    const users = ['a', 'b', 'c'].map(n => ({ id: randomUUID(), username: `zzt_${tag}_${n}` }));
    const [a, b, c] = users as [typeof users[0], typeof users[0], typeof users[0]];
    const games = new GameService(prismaPersistence, null, { toRoom: () => {} }, { turnMs: 60_000, flushMs: 60_000 });

    const dbColors = async (roomId: string) =>
        Object.fromEntries(
            (await prisma.gamePlayer.findMany({ where: { gameRoomId: roomId }, select: { userId: true, color: true } }))
                .map(p => [p.userId, p.color]),
        );

    beforeAll(async () => {
        await prisma.user.createMany({ data: users });
    });

    afterAll(async () => {
        await games.stop();
        const ids = users.map(u => u.id);
        await prisma.gameRoom.deleteMany({ where: { createdById: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
    });

    test('picks, releases and 2-player follows are saved', async () => {
        const room = await games.createRoom(a.id, { maxPlayers: 4 });
        await games.joinRoom(b.id, room.gameCode);
        await games.joinRoom(c.id, room.gameCode);

        // b frees BLUE for YELLOW and c takes BLUE before b's write has landed: the writes must
        // reach Postgres in that order, or c's row would clash with b's on BLUE.
        await Promise.all([
            games.chooseColor(b.id, room.gameCode, 'YELLOW'),
            games.chooseColor(c.id, room.gameCode, 'BLUE'),
        ]);
        expect(await dbColors(room.id)).toEqual({ [a.id]: 'RED', [b.id]: 'YELLOW', [c.id]: 'BLUE' });

        await games.leaveRoom(b.id, room.gameCode);
        await games.chooseColor(a.id, room.gameCode, 'YELLOW');
        expect(await dbColors(room.id)).toEqual({ [a.id]: 'YELLOW', [c.id]: 'BLUE' });

        const duo = await games.createRoom(b.id, { maxPlayers: 2 });
        await games.joinRoom(c.id, duo.gameCode);
        await games.chooseColor(c.id, duo.gameCode, 'BLUE');
        expect(await dbColors(duo.id)).toEqual({ [b.id]: 'YELLOW', [c.id]: 'BLUE' });
    });
});
