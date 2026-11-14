import { itemById } from './catalog';

/**
 * Things sold for real money, through RevenueCat (Google Play now, the App Store later). Each id
 * is the store's product id, set up in Play Console and in RevenueCat as a non-consumable, so
 * Play keeps it on the buyer's Google account and Restore Purchases can find it. The price lives
 * in the store, in the player's currency.
 *
 * They only ever grant cosmetics and perks. Never coins, rolls or anything that changes a game.
 */
export type ProductKind = 'starter' | 'set' | 'noads';

export interface Product {
    id: string;
    kind: ProductKind;
    name: string;
    /** Shop item ids it grants (catalog.ts), or perks (PERK). */
    grants: string[];
}

/** Perks are entitlements that aren't shop items. */
export const PERK = {
    /** No full-screen ads after games. Rewarded ads stay: players choose them, for coins. */
    noAds: 'perk.noads',
} as const;

export const PRODUCTS: readonly Product[] = [
    { id: 'starter_pack', kind: 'starter', name: 'Starter Pack', grants: ['pawn.duck', 'dice.midnight', 'board.midnight'] },
    { id: 'set_festival', kind: 'set', name: 'Festival Set', grants: ['pawn.diya', 'dice.gold', 'board.diwali'] },
    { id: 'set_space', kind: 'set', name: 'Space Set', grants: ['pawn.rocket', 'dice.midnight', 'board.space'] },
    { id: 'set_royal', kind: 'set', name: 'Royal Set', grants: ['pawn.crown', 'dice.gold', 'board.royal'] },
    { id: 'set_spooky', kind: 'set', name: 'Spooky Set', grants: ['pawn.ghost', 'dice.candy', 'board.haunted'] },
    { id: 'remove_ads', kind: 'noads', name: 'Remove Ads', grants: [PERK.noAds] },
];

const BY_ID = new Map(PRODUCTS.map(p => [p.id, p]));

export function productById(id: string): Product | undefined {
    return BY_ID.get(id);
}

// A typo in a grant would sell nothing: fail at start instead.
for (const p of PRODUCTS) {
    for (const g of p.grants) {
        if (!g.startsWith('perk.') && !itemById(g)) throw new Error(`products: ${p.id} grants unknown item ${g}`);
    }
}
