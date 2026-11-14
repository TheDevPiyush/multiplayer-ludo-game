import { createPublicKey, verify, type KeyObject } from 'crypto';

import { log } from '../lib/logger';

/**
 * AdMob rewarded-ad server-side verification (SSV). After a player earns a reward, Google calls
 * our URL with the reward's details, signed with one of its published keys. Only a correctly
 * signed call pays anything, so a modified app can't make up rewards.
 * https://developers.google.com/admob/android/ssv
 */
const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 24 * 60 * 60_000;

export interface SsvCall {
    /** Everything before `&signature=`: what Google signed. */
    message: string;
    signature: Buffer;
    keyId: string;
    params: URLSearchParams;
}

/** Splits a raw query string (as sent, not re-encoded). Google always puts signature and key_id last. */
export function parseSsvQuery(rawQuery: string): SsvCall | null {
    const at = rawQuery.indexOf('&signature=');
    if (at <= 0) return null;
    const params = new URLSearchParams(rawQuery);
    const signature = params.get('signature');
    const keyId = params.get('key_id');
    if (!signature || !keyId) return null;
    return { message: rawQuery.slice(0, at), signature: Buffer.from(signature, 'base64url'), keyId, params };
}

export function verifySsv(call: SsvCall, key: KeyObject): boolean {
    try {
        return verify('sha256', Buffer.from(call.message), { key, dsaEncoding: 'der' }, call.signature);
    } catch {
        return false;
    }
}

let keys = new Map<string, KeyObject>();
let fetchedAt = 0;

/** Google's key with this id; the list is refetched daily, or when an unknown id shows up. */
export async function verifierKey(keyId: string, fetchFn: typeof fetch = fetch): Promise<KeyObject | null> {
    const stale = Date.now() - fetchedAt > KEYS_TTL_MS;
    if (!keys.has(keyId) || stale) {
        try {
            const res = await fetchFn(KEYS_URL);
            const body = (await res.json()) as { keys?: { keyId: number | string; pem: string }[] };
            const next = new Map<string, KeyObject>();
            for (const k of body.keys ?? []) next.set(String(k.keyId), createPublicKey(k.pem));
            if (next.size > 0) {
                keys = next;
                fetchedAt = Date.now();
            }
        } catch (e) {
            log.error('ad verifier keys fetch failed', { error: (e as Error)?.message });
        }
    }
    return keys.get(keyId) ?? null;
}

/** For tests. */
export function setVerifierKeys(next: Map<string, KeyObject>) {
    keys = next;
    fetchedAt = Date.now();
}
