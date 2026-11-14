import { describe, expect, test } from 'bun:test';

import { parseNonSubscriptions } from '../purchases/revenuecat';
import { accountsIn } from '../purchases/purchases.routes';
import { PRODUCTS } from '../shop/products';
import { itemById } from '../shop/catalog';

describe('RevenueCat customer', () => {
    test('reads one-time purchases, skipping broken entries', () => {
        const list = parseNonSubscriptions({
            subscriber: {
                non_subscriptions: {
                    set_space: [
                        { id: 'a1', store: 'play_store', is_sandbox: true, purchase_date: '2026-11-11T10:00:00Z', store_transaction_id: 'GPA.1' },
                        { id: 'a2', store: 'play_store', purchase_date: 'not a date' },
                    ],
                    remove_ads: [{ id: 'b1', store: 'app_store', purchase_date: '2026-11-10T10:00:00Z' }],
                },
            },
        });
        expect(list).toEqual([
            { rcId: 'a1', productId: 'set_space', store: 'play_store', sandbox: true, purchasedAt: new Date('2026-11-11T10:00:00Z'), storeTransactionId: 'GPA.1' },
            { rcId: 'b1', productId: 'remove_ads', store: 'app_store', sandbox: false, purchasedAt: new Date('2026-11-10T10:00:00Z'), storeTransactionId: null },
        ]);
        expect(parseNonSubscriptions({})).toEqual([]);
        expect(parseNonSubscriptions(null)).toEqual([]);
    });
});

describe('webhook', () => {
    test('names only our accounts, once each', () => {
        const a = '0b7e0c1e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
        const b = '1c8f1d2f-5b6c-4d7e-9f0a-1b2c3d4e5f60';
        expect(accountsIn({
            app_user_id: a,
            original_app_user_id: '$RCAnonymousID:abc',
            aliases: [a, '$RCAnonymousID:abc'],
            transferred_from: [b],
        }).sort()).toEqual([a, b].sort());
        expect(accountsIn({})).toEqual([]);
    });
});

describe('products', () => {
    test('sell only cosmetics and perks, never coins', () => {
        for (const p of PRODUCTS) {
            for (const g of p.grants) expect(g.startsWith('perk.') || !!itemById(g)).toBe(true);
            expect(p.grants.some(g => /coin/i.test(g))).toBe(false);
        }
    });
});
