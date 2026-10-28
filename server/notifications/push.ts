import { Prisma } from '../generated/prisma/client.ts';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { RateLimiter } from '../lib/rate-limit';

/** Devices kept per user, newest first. */
export const MAX_PUSH_TOKENS = 3;
const TOKEN_RE = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,}\]$/;

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo's limits per request. */
const SEND_CHUNK = 100;
const RECEIPT_CHUNK = 300;
/** Receipts are ready within minutes; they say which tokens are dead. */
const RECEIPT_DELAY_MS = 15 * 60_000;

/**
 * What a push is about. Each has its own Android channel (the app creates them),
 * so people can turn reminders off and keep invites.
 */
export type PushKind = 'invite' | 'friend' | 'online' | 'reminder';
const CHANNEL: Record<PushKind, string> = { invite: 'invites', friend: 'friends', online: 'friends', reminder: 'reminders' };

export interface PushMessage {
    title: string;
    body: string;
    /** App route opened on tap: `/join/ABC123`, `/friends?tab=requests`, `/`. */
    url: string;
}

/**
 * Social pushes per user, all kinds together: however many friends invite or
 * come online, a phone gets at most a few an hour. Reminders have their own schedule.
 */
const perUser = new RateLimiter(6, 1 / 600);

export function isPushToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Makes `token` this user's newest device (dropping their oldest past 3) and takes it off anyone else. */
export async function savePushToken(userId: string, token: string) {
    await prisma.$transaction([
        // A phone that signed into another account belongs to that account now.
        prisma.$executeRaw`UPDATE "User" SET "pushTokens" = array_remove("pushTokens", ${token}) WHERE ${token} = ANY("pushTokens") AND id <> ${userId}`,
        prisma.$executeRaw`UPDATE "User" SET "pushTokens" = (ARRAY[${token}]::text[] || array_remove("pushTokens", ${token}))[1:${Prisma.raw(String(MAX_PUSH_TOKENS))}], "lastSeenAt" = now() WHERE id = ${userId}`,
    ]);
}

/** Signed out on that device, or Expo says the app is gone from it. */
export async function removePushTokens(tokens: string[], userId?: string) {
    for (const token of new Set(tokens)) {
        if (userId) await prisma.$executeRaw`UPDATE "User" SET "pushTokens" = array_remove("pushTokens", ${token}) WHERE id = ${userId}`;
        else await prisma.$executeRaw`UPDATE "User" SET "pushTokens" = array_remove("pushTokens", ${token}) WHERE ${token} = ANY("pushTokens")`;
    }
}

type ExpoMessage = {
    to: string;
    title: string;
    body: string;
    data: { url: string; kind: PushKind };
    channelId: string;
    sound: 'default';
    priority: 'high' | 'normal';
};
type Ticket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };
type Receipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

/** Network side, swappable in tests. Returns one ticket per message, in order. */
export type PushTransport = {
    send(messages: ExpoMessage[]): Promise<Ticket[]>;
    receipts(ids: string[]): Promise<Record<string, Receipt>>;
};

async function expoPost<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            // Only needed when "Enhanced push security" is on in the Expo project.
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { data: T }).data;
}

let transport: PushTransport = {
    send: messages => expoPost<Ticket[]>(SEND_URL, messages),
    receipts: ids => expoPost<Record<string, Receipt>>(RECEIPTS_URL, { ids }),
};

export function setPushTransport(t: PushTransport) {
    transport = t;
}

const deadToken = (r: Ticket | Receipt) => r.status === 'error' && r.details?.error === 'DeviceNotRegistered';

async function checkReceipts(byId: Map<string, string>) {
    const ids = [...byId.keys()];
    const dead: string[] = [];
    for (let i = 0; i < ids.length; i += RECEIPT_CHUNK) {
        const receipts = await transport.receipts(ids.slice(i, i + RECEIPT_CHUNK));
        for (const [id, r] of Object.entries(receipts)) {
            if (deadToken(r)) dead.push(byId.get(id)!);
            else if (r.status === 'error') log.warn('push receipt error', { error: r.details?.error, message: r.message });
        }
    }
    if (dead.length) await removePushTokens(dead);
}

/** Sends to every device of every user given; drops tokens Expo says are dead. */
export async function sendPushes(items: { userId: string; tokens: string[]; message: PushMessage }[], kind: PushKind) {
    const messages: ExpoMessage[] = items.flatMap(({ tokens, message }) =>
        tokens.map(to => ({
            to,
            title: message.title,
            body: message.body,
            data: { url: message.url, kind },
            channelId: CHANNEL[kind],
            sound: 'default' as const,
            priority: kind === 'invite' ? ('high' as const) : ('normal' as const),
        })),
    );
    const dead: string[] = [];
    const pending = new Map<string, string>();
    for (let i = 0; i < messages.length; i += SEND_CHUNK) {
        const chunk = messages.slice(i, i + SEND_CHUNK);
        let tickets: Ticket[];
        try {
            tickets = await transport.send(chunk);
        } catch (e) {
            log.error('push send failed', { kind, count: chunk.length, error: (e as Error)?.message });
            continue;
        }
        tickets.forEach((t, j) => {
            if (t.status === 'ok') pending.set(t.id, chunk[j]!.to);
            else if (deadToken(t)) dead.push(chunk[j]!.to);
            else log.warn('push rejected', { kind, error: t.details?.error, message: t.message });
        });
    }
    if (dead.length) await removePushTokens(dead);
    if (pending.size) {
        setTimeout(() => {
            void checkReceipts(pending).catch(e => log.warn('push receipts failed', { error: (e as Error)?.message }));
        }, RECEIPT_DELAY_MS).unref?.();
    }
    log.info('push sent', { kind, users: items.length, devices: messages.length, dead: dead.length || undefined });
}

/**
 * Fire and forget: one social push to each user, to all their devices. Users
 * past their hourly allowance, or without a device, are skipped.
 */
export function pushTo(userIds: string | string[], kind: Exclude<PushKind, 'reminder'>, message: PushMessage | ((userId: string) => PushMessage)) {
    void (async () => {
        const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
        if (ids.length === 0) return;
        const rows = await prisma.user.findMany({
            where: { id: { in: ids }, NOT: { pushTokens: { isEmpty: true } } },
            select: { id: true, pushTokens: true },
        });
        const items = rows
            .filter(r => perUser.take(r.id))
            .map(r => ({ userId: r.id, tokens: r.pushTokens, message: typeof message === 'function' ? message(r.id) : message }));
        if (items.length) await sendPushes(items, kind);
    })().catch(e => log.error('push failed', { kind, error: (e as Error)?.message }));
}
