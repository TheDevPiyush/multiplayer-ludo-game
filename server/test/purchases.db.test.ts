import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

// Runs against the real database (DATABASE_URL) with throwaway rows it deletes afterwards.
// RevenueCat isn't called: the tests hand applyPurchases the list it would return.
const hasDb = !!process.env.DATABASE_URL;
const migrated = hasDb && await (async () => {
    const { prisma } = await import('../lib/prisma');
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"Purchase"') IS NOT NULL AS ok`;
    return rows[0]?.ok === true;
})();

describe.skipIf(!migrated)('purchases (database)', async () => {
    const { prisma } = await import('../lib/prisma');
    const { applyPurchases, equipProduct, revokeByTransaction } = await import('../purchases/sync');
    const { getShop } = await import('../shop/shop');
    const { findInactiveGuests, GUEST_RETENTION_MS } = await import('../auth/guest-cleanup');
    const { removeUser } = await import('../auth/remove-user');
    type StorePurchase = import('../purchases/revenuecat').StorePurchase;

    const tag = randomUUID().slice(0, 6);
    const old = new Date(Date.now() - GUEST_RETENTION_MS - 24 * 60 * 60 * 1000);
    const a = { id: randomUUID(), username: `zzp_${tag}_a`, provider: 'google' };
    const b = { id: randomUUID(), username: `zzp_${tag}_b`, provider: 'anonymous', updatedAt: old };
    const buy = (productId: string, n: string): StorePurchase => ({
        rcId: `zz_${tag}_${n}`, productId, store: 'play_store', sandbox: true, purchasedAt: new Date(), storeTransactionId: `GPA.zz-${tag}-${n}`,
    });
    const space = buy('set_space', 'space');
    const starter = buy('starter_pack', 'starter');
    const noAds = buy('remove_ads', 'noads');

    const owned = async (userId: string) =>
        (await prisma.entitlement.findMany({ where: { userId }, select: { itemId: true, source: true } }))
            .map(e => `${e.itemId}:${e.source}`).sort();

    beforeAll(async () => {
        await prisma.user.createMany({ data: [a, b] });
        // Bought with coins before: a set that includes it doesn't take it over.
        await prisma.entitlement.create({ data: { userId: a.id, itemId: 'dice.midnight', source: 'COINS' } });
    });
    afterAll(async () => {
        await prisma.purchase.deleteMany({ where: { rcId: { startsWith: `zz_${tag}_` } } });
        await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    });

    test('a purchase grants its items once, and the shop shows it', async () => {
        await applyPurchases(a.id, [space, noAds]);
        await applyPurchases(a.id, [space, noAds]);
        expect(await owned(a.id)).toEqual(['board.space:PLAY', 'dice.midnight:COINS', 'pawn.rocket:PLAY', 'perk.noads:PLAY']);
        const shop = await getShop(a.id);
        expect(shop.noAds).toBe(true);
        expect(shop.products.find(p => p.id === 'set_space')).toMatchObject({ bought: true, items: ['pawn.rocket', 'dice.midnight', 'board.space'] });
        expect(shop.products.find(p => p.id === 'set_royal')!.bought).toBe(false);
        expect(shop.items.find(i => i.id === 'pawn.rocket')!.owned).toBe(true);

        await equipProduct(a.id, 'set_space');
        expect((await getShop(a.id)).equipped).toEqual({ pawn: 'pawn.rocket', dice: 'dice.midnight', board: 'board.space' });
    }, 30_000);

    test('a refund takes back only what no other purchase covers, for good', async () => {
        await applyPurchases(a.id, [space, noAds, starter]);
        expect(await revokeByTransaction(space.storeTransactionId!)).toBe(a.id);
        expect(await owned(a.id)).toEqual(['board.midnight:PLAY', 'dice.midnight:COINS', 'pawn.duck:PLAY', 'perk.noads:PLAY']);
        // RevenueCat may still list it: it stays refunded.
        await applyPurchases(a.id, [space, noAds, starter]);
        expect((await owned(a.id)).includes('pawn.rocket:PLAY')).toBe(false);
        expect((await getShop(a.id)).equipped.pawn).toBe('pawn.classic');
        expect(await revokeByTransaction('GPA.unknown')).toBeUndefined();
    }, 30_000);

    test('a restore on another account moves the purchase there', async () => {
        await applyPurchases(b.id, [noAds]);
        expect(await owned(b.id)).toEqual(['perk.noads:PLAY']);
        expect((await owned(a.id)).includes('perk.noads:PLAY')).toBe(false);
        // A's next sync no longer lists it: nothing changes for B.
        await applyPurchases(a.id, [space, starter]);
        expect(await owned(b.id)).toEqual(['perk.noads:PLAY']);
    }, 30_000);

    test('guest clean-up keeps buyers; deleting keeps the purchase without an owner', async () => {
        expect(await findInactiveGuests(new Date(Date.now() - GUEST_RETENTION_MS), 10_000)).not.toContain(b.id);
        expect(await removeUser(b.id, async () => true)).toBe(true);
        const row = await prisma.purchase.findUnique({ where: { rcId: noAds.rcId } });
        expect(row?.userId).toBeNull();
    }, 30_000);
});
