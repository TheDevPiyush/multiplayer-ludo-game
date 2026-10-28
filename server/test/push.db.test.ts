import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { nextReminderAt } from '../notifications/reminders';

const HOUR = 60 * 60_000;

describe('reminder schedule', () => {
    // 2026-10-28 00:00 IST is 2026-10-27 18:30 UTC.
    const midnightIst = Date.UTC(2026, 9, 27, 18, 30);

    test('picks the next slot of the day, in the given zone', () => {
        expect(nextReminderAt(midnightIst + 9 * HOUR, ['13:00', '19:30'], 330)).toBe(midnightIst + 13 * HOUR);
        expect(nextReminderAt(midnightIst + 13 * HOUR, ['19:30', '13:00'], 330)).toBe(midnightIst + 19.5 * HOUR);
    });

    test('rolls over to tomorrow after the last slot', () => {
        expect(nextReminderAt(midnightIst + 20 * HOUR, ['13:00', '19:30'], 330)).toBe(midnightIst + 37 * HOUR);
    });

    test('no valid times: never', () => {
        expect(nextReminderAt(midnightIst, [], 330)).toBe(Infinity);
        expect(nextReminderAt(midnightIst, ['soon'], 330)).toBe(Infinity);
    });
});

// Runs against the real database (DATABASE_URL) with throwaway users it deletes afterwards.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('push tokens', async () => {
    const { prisma } = await import('../lib/prisma');
    const { savePushToken, sendPushes, setPushTransport } = await import('../notifications/push');

    const tag = randomUUID().slice(0, 6);
    const a = { id: randomUUID(), username: `zzp_${tag}_a` };
    const b = { id: randomUUID(), username: `zzp_${tag}_b` };
    const tok = (n: string) => `ExponentPushToken[${tag}${n}xxxxxxxx]`;
    const tokensOf = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { pushTokens: true } }))!.pushTokens;

    beforeAll(async () => {
        await prisma.user.createMany({ data: [a, b] });
    });
    afterAll(async () => {
        await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    });

    test('keeps the 3 most recent devices, newest first', async () => {
        for (const n of ['1', '2', '3', '4']) await savePushToken(a.id, tok(n));
        expect(await tokensOf(a.id)).toEqual([tok('4'), tok('3'), tok('2')]);
        // Syncing an existing device moves it to the front without duplicating it.
        await savePushToken(a.id, tok('2'));
        expect(await tokensOf(a.id)).toEqual([tok('2'), tok('4'), tok('3')]);
        const row = await prisma.user.findUnique({ where: { id: a.id }, select: { lastSeenAt: true } });
        expect(row!.lastSeenAt).not.toBeNull();
    });

    test('a device signing into another account moves to it', async () => {
        await savePushToken(b.id, tok('4'));
        expect(await tokensOf(b.id)).toEqual([tok('4')]);
        expect(await tokensOf(a.id)).toEqual([tok('2'), tok('3')]);
    });

    test('tokens Expo reports as unregistered are dropped', async () => {
        const sent: string[] = [];
        setPushTransport({
            async send(messages) {
                sent.push(...messages.map(m => m.to));
                return messages.map(m =>
                    m.to === tok('3')
                        ? { status: 'error' as const, details: { error: 'DeviceNotRegistered' } }
                        : { status: 'ok' as const, id: randomUUID() },
                );
            },
            async receipts() {
                return {};
            },
        });
        await sendPushes([{ userId: a.id, tokens: await tokensOf(a.id), message: { title: 't', body: 'b', url: '/' } }], 'friend');
        expect(sent).toEqual([tok('2'), tok('3')]);
        expect(await tokensOf(a.id)).toEqual([tok('2')]);
    });
});
