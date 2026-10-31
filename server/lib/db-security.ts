import { log } from './logger';
import { prisma } from './prisma';

/**
 * Supabase serves every "public" table over its REST API. Ours are locked with
 * RLS (migration 20261031130000_lock_public_tables); a table a later migration
 * adds needs `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` in that migration too.
 * Checked once at startup so a missed one shows up in the logs.
 */
export async function warnAboutOpenTables() {
    try {
        const rows = await prisma.$queryRaw<{ tablename: string }[]>`
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false`;
        if (rows.length) {
            log.warn('tables without row level security (reachable through the Supabase API)', {
                tables: rows.map(r => r.tablename).join(','),
            });
        }
    } catch (e) {
        log.debug('RLS check skipped', { error: (e as Error)?.message });
    }
}
