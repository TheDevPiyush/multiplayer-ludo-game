import { prisma } from '../lib/prisma';
import { TtlCache } from '../lib/ttl-cache';

/** Per user: everyone they blocked or who blocked them. Read on every emote and chat line. */
const related = new TtlCache<string, Set<string>>(20_000, 10 * 60_000);
const loading = new Map<string, Promise<Set<string>>>();
/** Bumped on every change, so a load that started before it isn't cached. */
let generation = 0;

/** Users this one has blocked or been blocked by: neither side sees the other's emotes or chat. */
export function blockedEither(userId: string): Promise<Set<string>> {
    const hit = related.get(userId);
    if (hit) return Promise.resolve(hit);
    let pending = loading.get(userId);
    if (!pending) {
        const startedAt = generation;
        pending = (async () => {
            const rows = await prisma.block.findMany({
                where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
                select: { blockerId: true, blockedId: true },
            });
            const set = new Set(rows.map(r => (r.blockerId === userId ? r.blockedId : r.blockerId)));
            if (startedAt === generation) related.set(userId, set);
            return set;
        })().finally(() => loading.delete(userId));
        loading.set(userId, pending);
    }
    return pending;
}

export async function isBlockedEither(a: string, b: string): Promise<boolean> {
    return (await blockedEither(a)).has(b);
}

export function blocksChanged(...userIds: string[]) {
    generation++;
    for (const id of userIds) related.delete(id);
}
