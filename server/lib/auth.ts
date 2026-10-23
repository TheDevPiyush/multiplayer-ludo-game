import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { TtlCache } from './ttl-cache';

export interface AuthUser {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
const issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined;
// jose caches the key set and only refetches on an unknown `kid`.
const jwks = supabaseUrl ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;
const hsKey = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;

/** Verified tokens, keyed by hash, kept until the token itself expires. */
const verified = new TtlCache<string, AuthUser>(5_000, 60 * 60 * 1000);

function fromClaims(p: JWTPayload): AuthUser | null {
    if (typeof p.sub !== 'string') return null;
    return {
        id: p.sub,
        email: typeof p.email === 'string' ? p.email : undefined,
        user_metadata: (p.user_metadata as Record<string, unknown>) ?? {},
        app_metadata: (p.app_metadata as Record<string, unknown>) ?? {},
    };
}

async function verifyLocally(token: string): Promise<{ user: AuthUser; exp?: number } | null> {
    const opts = { issuer, audience: 'authenticated' };
    const attempts = [
        jwks && (() => jwtVerify(token, jwks, opts)),
        hsKey && (() => jwtVerify(token, hsKey, opts)),
    ];
    for (const attempt of attempts) {
        if (!attempt) continue;
        try {
            const { payload } = await attempt();
            const user = fromClaims(payload);
            if (user) return { user, exp: payload.exp };
        } catch {
            // Try the next key source.
        }
    }
    return null;
}

/**
 * Verifies a Supabase access token. Local JWT verification first (no network),
 * falling back to Supabase's API for projects on legacy secrets we don't hold.
 */
export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
    const cacheKey = createHash('sha256').update(token).digest('base64url');
    const cached = verified.get(cacheKey);
    if (cached) return cached;

    const local = await verifyLocally(token);
    if (local) {
        const ttl = local.exp ? local.exp * 1000 - Date.now() : 5 * 60 * 1000;
        if (ttl > 0) verified.set(cacheKey, local.user, ttl);
        return ttl > 0 ? local.user : null;
    }

    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const user: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata ?? {},
        app_metadata: data.user.app_metadata ?? {},
    };
    verified.set(cacheKey, user, 5 * 60 * 1000);
    return user;
}

export function isAuthConfigured(): boolean {
    return !!(jwks || hsKey || supabase);
}
