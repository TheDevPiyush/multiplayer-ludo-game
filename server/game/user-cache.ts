import { prisma } from '../lib/prisma';
import { TtlCache } from '../lib/ttl-cache';

export type UserRow = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

/** `/auth/me` rows — stats only change at game end, which invalidates them. */
export const userRows = new TtlCache<string, UserRow>(10_000, 5 * 60_000);

/** `/game/history` responses per user, invalidated when that user finishes a game. */
export const historyCache = new TtlCache<string, unknown>(10_000, 10 * 60_000);

export async function getUserRow(id: string): Promise<UserRow | null> {
    const hit = userRows.get(id);
    if (hit) return hit;
    const row = await prisma.user.findUnique({ where: { id } });
    if (row) userRows.set(id, row);
    return row;
}

export function invalidateUsers(ids: string[]) {
    for (const id of ids) {
        userRows.delete(id);
        historyCache.delete(id);
    }
}
