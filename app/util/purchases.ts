import { NativeModules, Platform } from 'react-native';

import { supabase } from '@/util/supabase-client';

/**
 * Real-money purchases through RevenueCat (react-native-purchases): Google Play now, the App Store
 * later. The app only buys and restores. What a player owns always comes from our server, which
 * asks RevenueCat itself (server/purchases), so nothing here is trusted for granting.
 *
 * Keys: EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / _IOS_KEY, RevenueCat's public SDK keys (safe to ship).
 * Without one, or in a build without the native module, the paid part of the shop is hidden.
 *
 * RevenueCat's customer id is our player id, so purchases follow the account, not the phone.
 */
type RC = typeof import('react-native-purchases');
type Purchases = RC['default'];
export type StoreProduct = import('react-native-purchases').PurchasesStoreProduct;

let lib: RC | null | undefined;

function load(): Purchases | null {
    if (lib === undefined) {
        lib = null;
        if (Platform.OS === 'android' || Platform.OS === 'ios') {
            if (NativeModules.RNPurchases) {
                try {
                    lib = require('react-native-purchases') as RC;
                } catch {
                    lib = null;
                }
            }
        }
    }
    return lib?.default ?? null;
}

const env = (key: string) => (process.env[key] ?? '').trim() || null;
const apiKey = Platform.OS === 'ios' ? env('EXPO_PUBLIC_REVENUECAT_IOS_KEY') : env('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');

export function purchasesAvailable(): boolean {
    return !!apiKey && !!load();
}

// ─── Who is buying ───────────────────────────────────────────────────────────

let configured = false;
let current: string | null = null;
/** Sign-ins and sign-outs are applied one at a time, in order. */
let queue: Promise<void> = Promise.resolve();

function identify(userId: string | null): Promise<void> {
    queue = queue.then(async () => {
        const P = load();
        if (!P || !apiKey) return;
        try {
            if (!configured) {
                // Not before someone signs in: an anonymous RevenueCat customer would only need merging later.
                if (!userId) return;
                P.configure({ apiKey, appUserID: userId });
                configured = true;
            } else if (userId && userId !== current) {
                await P.logIn(userId);
            } else if (!userId && current) {
                await P.logOut();
            }
            current = userId;
        } catch {
            // Tried again on the next sign-in change or purchase.
        }
    });
    return queue;
}

/** Keeps RevenueCat's customer in step with who is signed in. Call once, from the root layout. */
export function startPurchases(): () => void {
    if (!purchasesAvailable()) return () => {};
    void supabase.auth.getSession().then(({ data }) => identify(data.session?.user.id ?? null));
    // Outside the callback: Supabase calls made inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => void identify(session?.user.id ?? null), 0);
    });
    return () => data.subscription.unsubscribe();
}

/** Ready to buy for this player: RevenueCat set up as them, so the purchase lands on their account. */
async function readyFor(): Promise<Purchases | null> {
    const P = load();
    if (!P) return null;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    if (!userId) return null;
    await identify(userId);
    return configured && current === userId ? P : null;
}

// ─── Products ────────────────────────────────────────────────────────────────

const products = new Map<string, StoreProduct>();

/** The store's products (with local prices) for these ids. Ones the store doesn't sell are left out. */
export async function storeProducts(ids: string[]): Promise<Map<string, StoreProduct>> {
    const missing = ids.filter(id => !products.has(id));
    if (missing.length) {
        const P = await readyFor();
        if (P && lib) {
            try {
                const found = await P.getProducts(missing, lib.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
                for (const p of found) products.set(p.identifier, p);
            } catch {
                // No store (an emulator without Play), or offline: the paid shop stays hidden.
            }
        }
    }
    return new Map(ids.flatMap(id => (products.has(id) ? [[id, products.get(id)!] as const] : [])));
}

export type BuyResult =
    | { kind: 'bought' }
    /** Already bought on this Google account (maybe by another of our accounts): restore instead. */
    | { kind: 'owned' }
    /** UPI and some cards confirm later; the items arrive when it goes through. */
    | { kind: 'pending' }
    | { kind: 'cancelled' }
    | { kind: 'failed'; error: string };

export async function buyProduct(id: string): Promise<BuyResult> {
    const P = await readyFor();
    const product = products.get(id) ?? (await storeProducts([id])).get(id);
    if (!P || !lib || !product) return { kind: 'failed', error: "The store isn't available right now. Try again in a moment." };
    const codes = lib.PURCHASES_ERROR_CODE;
    try {
        await P.purchaseStoreProduct(product);
        return { kind: 'bought' };
    } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === codes.PURCHASE_CANCELLED_ERROR) return { kind: 'cancelled' };
        if (code === codes.PRODUCT_ALREADY_PURCHASED_ERROR) return { kind: 'owned' };
        if (code === codes.PAYMENT_PENDING_ERROR) return { kind: 'pending' };
        if (code === codes.PURCHASE_NOT_ALLOWED_ERROR) return { kind: 'failed', error: "Purchases aren't allowed on this device or Google account." };
        return { kind: 'failed', error: "The purchase didn't go through. You haven't been charged." };
    }
}

/**
 * Hands this Google account's purchases to the signed-in player (RevenueCat moves them from any
 * other of our accounts). The server then syncs them.
 */
export async function restoreStorePurchases(): Promise<boolean> {
    const P = await readyFor();
    if (!P) return false;
    try {
        await P.restorePurchases();
        return true;
    } catch {
        return false;
    }
}
