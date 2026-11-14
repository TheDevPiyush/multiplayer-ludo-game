import { log } from '../lib/logger';

/**
 * RevenueCat's REST API (v1). The server never trusts what the app or a webhook says was bought:
 * it asks RevenueCat for the customer's purchases and syncs from that, as RevenueCat recommends.
 *
 * REVENUECAT_SECRET_KEY: a secret API key (Project settings → API keys), never shipped in the app.
 */
const KEY = (process.env.REVENUECAT_SECRET_KEY ?? '').trim();
const BASE = 'https://api.revenuecat.com/v1';

export const purchasesConfigured = () => KEY.length > 0;

/** One purchase of a one-time product. */
export interface StorePurchase {
    rcId: string;
    productId: string;
    store: string;
    sandbox: boolean;
    purchasedAt: Date;
    storeTransactionId: string | null;
}

type NonSubscription = {
    id?: string;
    store?: string;
    is_sandbox?: boolean;
    purchase_date?: string;
    store_transaction_id?: string | null;
};

/** The customer's one-time purchases, from `subscriber.non_subscriptions` (keyed by product id). */
export function parseNonSubscriptions(body: unknown): StorePurchase[] {
    const all = (body as { subscriber?: { non_subscriptions?: Record<string, NonSubscription[]> } })?.subscriber?.non_subscriptions;
    if (!all || typeof all !== 'object') return [];
    const out: StorePurchase[] = [];
    for (const [productId, list] of Object.entries(all)) {
        if (!Array.isArray(list)) continue;
        for (const p of list) {
            const purchasedAt = new Date(p.purchase_date ?? '');
            if (!p.id || !p.store || Number.isNaN(+purchasedAt)) continue;
            out.push({
                rcId: p.id,
                productId,
                store: p.store,
                sandbox: p.is_sandbox === true,
                purchasedAt,
                storeTransactionId: p.store_transaction_id || null,
            });
        }
    }
    return out;
}

/** Null when RevenueCat can't be reached or refuses: the caller must not treat that as "owns nothing". */
export async function fetchPurchases(appUserId: string): Promise<StorePurchase[] | null> {
    if (!KEY) return null;
    try {
        const res = await fetch(`${BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
            headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            log.error('revenuecat: customer fetch failed', { user: appUserId, status: res.status });
            return null;
        }
        return parseNonSubscriptions(await res.json());
    } catch (e) {
        log.error('revenuecat: customer fetch failed', { user: appUserId, error: (e as Error)?.message });
        return null;
    }
}
