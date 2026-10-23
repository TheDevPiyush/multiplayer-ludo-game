import { RedisClient } from 'bun';

/**
 * Optional hot store. When REDIS_URL is unset everything still works —
 * live games are kept in memory and snapshotted to Postgres.
 */
export const redis: RedisClient | null = process.env.REDIS_URL
    ? new RedisClient(process.env.REDIS_URL)
    : null;
