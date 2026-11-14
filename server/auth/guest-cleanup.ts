import { canDeleteAuthUsers, GUEST_PROVIDER } from '../lib/auth';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { removeUser } from './remove-user';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Guests nobody has used for this long are deleted, with their stats and games. */
export const GUEST_RETENTION_MS = Number(process.env.GUEST_RETENTION_DAYS ?? 30) * DAY_MS;
const BATCH = 100;
/** Per run, so a big backlog drains over a few days instead of hammering Supabase's admin API. */
const MAX_PER_RUN = 1_000;

/**
 * Guests with no activity since `cutoff`: their row wasn't touched (sign-ins
 * touch it daily, see ensureUser) and they joined no game since. Guests who
 * bought something are kept: a purchase is never deleted out from under them.
 */
export async function findInactiveGuests(cutoff: Date, limit = BATCH): Promise<string[]> {
    const rows = await prisma.user.findMany({
        where: {
            provider: GUEST_PROVIDER,
            updatedAt: { lt: cutoff },
            gamePlayers: { none: { joinedAt: { gte: cutoff } } },
            purchases: { none: {} },
        },
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
        take: limit,
    });
    return rows.map(r => r.id);
}

export async function pruneGuests(now = Date.now()): Promise<number> {
    const cutoff = new Date(now - GUEST_RETENTION_MS);
    let removed = 0;
    let failed = 0;
    while (removed + failed < MAX_PER_RUN) {
        // Failed ones are still inactive and come back first, so skip past them.
        const skip = failed;
        const ids = await findInactiveGuests(cutoff, BATCH + skip);
        const todo = ids.slice(skip);
        for (const id of todo) {
            try {
                if (await removeUser(id)) removed++;
                else failed++;
            } catch (e) {
                failed++;
                log.error('guest cleanup: delete failed', { user: id, error: (e as Error)?.message });
            }
        }
        if (todo.length < BATCH) break;
    }
    log.info('guests pruned', { removed, failed });
    return removed;
}

/** Runs the cleanup a couple of minutes after start, then daily. */
export function startGuestCleanup() {
    if (!canDeleteAuthUsers()) {
        log.info('guest cleanup off: no SUPABASE_SERVICE_ROLE_KEY');
        return;
    }
    const run = () => void pruneGuests().catch(e => log.error('guest cleanup failed', { error: (e as Error)?.message }));
    setTimeout(run, 2 * 60_000).unref?.();
    setInterval(run, DAY_MS).unref?.();
}
