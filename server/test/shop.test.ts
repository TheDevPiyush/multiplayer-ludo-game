import { describe, expect, test } from 'bun:test';

import { CATALOG, DEFAULT_ITEM, equippedItem, itemById } from '../shop/catalog';

describe('catalogue', () => {
    test('ids are unique, namespaced by kind, and each kind has one free default', () => {
        expect(new Set(CATALOG.map(i => i.id)).size).toBe(CATALOG.length);
        for (const item of CATALOG) expect(item.id.startsWith(`${item.kind}.`)).toBe(true);
        for (const [kind, id] of Object.entries(DEFAULT_ITEM)) {
            expect(CATALOG.filter(i => i.kind === kind && i.price === 0).map(i => i.id)).toEqual([id]);
        }
    });

    test('the cheapest item of each kind is affordable within a few days (coins are earned only)', () => {
        const cheapest = Math.min(...CATALOG.filter(i => i.price > 0).map(i => i.price));
        expect(cheapest).toBeLessThanOrEqual(300);
        expect(itemById('pawn.crown')?.kind).toBe('pawn');
        expect(itemById('nope')).toBeUndefined();
    });

    test('an equipped item counts only if it is of that kind and the player can use it', () => {
        const usable = new Set(['pawn.crown']);
        expect(equippedItem('pawn', 'pawn.crown', usable)).toBe('pawn.crown');
        expect(equippedItem('pawn', 'pawn.gem', usable)).toBeNull();
        expect(equippedItem('dice', 'pawn.crown', usable)).toBeNull();
        expect(equippedItem('pawn', 'pawn.classic', usable)).toBe('pawn.classic');
        expect(equippedItem('pawn', 'pawn.retired', usable)).toBeNull();
        expect(equippedItem('pawn', null, usable)).toBeNull();
    });
});
