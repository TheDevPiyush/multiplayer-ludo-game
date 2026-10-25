import type { Request } from 'express';

/**
 * Keyset ("cursor") pagination. A page is requested with `?cursor=<id of the
 * last item seen>&limit=n` and answered with `{ data, nextCursor }`; `nextCursor`
 * is null on the last page. Unlike offsets, rows arriving at the top while
 * someone scrolls don't shift later pages (no duplicates, nothing skipped).
 */
export const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

export function pageParams(req: Request, fallback = DEFAULT_PAGE): { limit: number; cursor: string | undefined } {
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || fallback));
    const raw = req.query.cursor;
    const cursor = typeof raw === 'string' && raw.length > 0 && raw.length <= 80 ? raw : undefined;
    return { limit, cursor };
}

/** Prisma args for the page after `cursor` (a unique id). Fetches one extra row to know if there's more. */
export function afterCursor(cursor: string | undefined, limit: number) {
    return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

/** Trims the extra row and derives the next cursor from the last row kept. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
    const more = rows.length > limit;
    const kept = more ? rows.slice(0, limit) : rows;
    return { rows: kept, nextCursor: more ? kept[kept.length - 1]!.id : null };
}
