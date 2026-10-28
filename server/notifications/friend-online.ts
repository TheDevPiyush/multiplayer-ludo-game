import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { RateLimiter } from '../lib/rate-limit';
import { TtlCache } from '../lib/ttl-cache';
import { pushTo } from './push';

const HOUR_MS = 60 * 60_000;
/** Coming back sooner than this after leaving is the same visit (app switch, flaky network). */
const AWAY_MS = Number(process.env.FRIEND_ONLINE_AWAY_MIN ?? 30) * 60_000;
/** After a deploy everyone reconnects at once: those aren't arrivals. */
const BOOT_QUIET_MS = 5 * 60_000;

/** Friends hear about one person at most this often… */
const perActor = new RateLimiter(1, 1 / ((Number(process.env.FRIEND_ONLINE_ACTOR_HOURS ?? 6) * HOUR_MS) / 1000));
/** …and a person hears about any friend coming online at most this often. */
const perRecipient = new RateLimiter(1, 1 / ((Number(process.env.FRIEND_ONLINE_RECIPIENT_HOURS ?? 3) * HOUR_MS) / 1000));

/** When each user's last device went offline. */
const wentAway = new TtlCache<string, number>(100_000, 24 * HOUR_MS);
const startedAt = Date.now();

export function friendWentOffline(userId: string) {
    wentAway.set(userId, Date.now());
}

/**
 * The user's first device connected. Friends who are offline get "X is online"
 * when X had been away a while, within the limits above.
 */
export function friendCameOnline(userId: string, isOnline: (userId: string) => boolean) {
    const awaySince = wentAway.get(userId);
    wentAway.delete(userId);
    const now = Date.now();
    if (now - startedAt < BOOT_QUIET_MS) return;
    if (awaySince !== undefined && now - awaySince < AWAY_MS) return;
    if (!perActor.take(userId)) return;

    void (async () => {
        const links = await prisma.friendship.findMany({
            where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
            select: { requesterId: true, addresseeId: true, requester: { select: { username: true } }, addressee: { select: { username: true } } },
            take: 500,
        });
        if (links.length === 0) return;
        const me = links[0]!.requesterId === userId ? links[0]!.requester : links[0]!.addressee;
        const to = links
            .map(l => (l.requesterId === userId ? l.addresseeId : l.requesterId))
            // Friends with the app open already see it in their list.
            .filter(id => !isOnline(id) && perRecipient.take(id));
        pushTo(to, 'online', {
            title: `@${me.username} is online 🎲`,
            body: 'Start a game together while they’re around.',
            url: '/friends',
        });
    })().catch(e => log.error('friend online push failed', { user: userId, error: (e as Error)?.message }));
}
