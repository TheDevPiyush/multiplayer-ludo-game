import type { NextFunction, Request, Response } from 'express';

import { log } from './logger';
import { TtlCache } from './ttl-cache';

/**
 * Token bucket per key: up to `burst` requests at once, refilled at `perSecond`.
 * Buckets live in memory and are dropped once they would be full again.
 */
export class RateLimiter {
    private buckets: TtlCache<string, { tokens: number; at: number }>;

    constructor(private burst: number, private perSecond: number, maxKeys = 20_000) {
        this.buckets = new TtlCache(maxKeys, Math.ceil((burst / perSecond) * 1000));
    }

    /** Spends one token; false when the key is over its limit. */
    take(key: string): boolean {
        const now = Date.now();
        const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
        const tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.perSecond);
        const ok = tokens >= 1;
        this.buckets.set(key, { tokens: ok ? tokens - 1 : tokens, at: now });
        return ok;
    }
}

/**
 * Express middleware. Keyed by the signed-in user when there is one (mount it
 * after token verification), otherwise by IP — needs `trust proxy` behind a proxy.
 */
export function rateLimit(name: string, burst: number, perSecond: number) {
    const limiter = new RateLimiter(burst, perSecond);
    return (req: Request, res: Response, next: NextFunction) => {
        const key = req.user?.id ?? req.ip ?? 'unknown';
        if (limiter.take(key)) return next();
        log.warn(`rate-limited: ${name}`, { user: req.user?.id, ip: req.ip });
        res.status(429).json({ message: 'Too many requests. Slow down a little.' });
    };
}
