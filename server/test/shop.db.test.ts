import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

// Runs against the real database (DATABASE_URL) with a throwaway user it deletes afterwards.
// Skipped until the cosmetics shop migration is applied.
const hasDb = !!process.env.DATABASE_URL;
const migrated = hasDb && await (async () => {
    const { prisma } = await import('../lib/prisma');
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"Entitlement"') IS NOT NULL AS ok`;
    return rows[0]?.ok === true;
})();

describe.skipIf(!migrated)('cosmetics shop (database)', async () => {
    const { prisma } = await import('../lib/prisma');
    const { buyItem, equipItem, getShop } = await import('../shop/shop');
    const { itemById } = await import('../shop/catalog');
    const { prismaPersistence } = await import('../game/persistence');

    const user = { id: randomUUID(), username: `zzs_${randomUUID().slice(0, 6)}`, provider: 'anonymous', coins: 1000 };
    const marble = itemById('pawn.marble')!;
    const gem = itemById('pawn.gem')!;

    beforeAll(async () => { await prisma.user.create({ data: user }); });
    afterAll(async () => { await prisma.user.deleteMany({ where: { id: user.id } }); });

    test('starts with the free defaults equipped and owned', async () => {
        const shop = await getShop(user.id);
        expect(shop.equipped).toEqual({ pawn: 'pawn.classic', dice: 'dice.classic', board: 'board.classic' });
        expect(shop.items.find(i => i.id === 'pawn.classic')!.owned).toBe(true);
        expect(shop.items.find(i => i.id === marble.id)!.owned).toBe(false);
        await expect(equipItem(user.id, marble.id)).rejects.toMatchObject({ status: 403 });
    }, 30_000);

    test('buying spends coins once, equips the item and shows in games', async () => {
        // Two taps at once: one buys, the other is refused.
        const both = await Promise.allSettled([buyItem(user.id, marble.id), buyItem(user.id, marble.id)]);
        expect(both.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const shop = await getShop(user.id);
        expect(shop.coins).toBe(1000 - marble.price);
        expect(shop.equipped.pawn).toBe(marble.id);
        expect(shop.items.find(i => i.id === marble.id)!.owned).toBe(true);
        const ledger = await prisma.coinLedger.findMany({ where: { userId: user.id, reason: 'SHOP' } });
        expect(ledger.map(l => l.amount)).toEqual([-marble.price]);
        expect((await prismaPersistence.getProfile(user.id))?.pawnSkin).toBe(marble.id);
    }, 30_000);

    test('not enough coins changes nothing; equipping the default puts it back', async () => {
        await expect(buyItem(user.id, gem.id)).rejects.toMatchObject({ status: 400 });
        expect((await getShop(user.id)).coins).toBe(1000 - marble.price);
        const back = await equipItem(user.id, 'pawn.classic');
        expect(back.shop.equipped.pawn).toBe('pawn.classic');
        expect(back.equipped).toBeNull();
        expect((await equipItem(user.id, marble.id)).shop.equipped.pawn).toBe(marble.id);
    }, 30_000);
});
