import { Prisma } from '../generated/prisma/client.ts';
import { ServiceError } from '../game/game-service';
import { prisma } from '../lib/prisma';
import { dayOf } from '../progress/rules';
import { CATALOG, DEFAULT_ITEM, EQUIP_COLUMN, equippedItem, itemById, type ItemKind } from './catalog';
import { PERK, PRODUCTS } from './products';

const TX = { timeout: 20_000, maxWait: 10_000 };
const KINDS = Object.keys(EQUIP_COLUMN) as ItemKind[];

/** Items the user owns now: bought for good, or a trial that hasn't ended. */
async function usableItems(userId: string, now: Date, db: Prisma.TransactionClient = prisma): Promise<Set<string>> {
    const rows = await db.entitlement.findMany({
        where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { itemId: true },
    });
    return new Set(rows.map(r => r.itemId));
}

/**
 * The shop as one player sees it: their coins, every item with whether they own it, what's
 * equipped, and the paid products (prices come from the store, in the app) with whether bought.
 */
export async function getShop(userId: string, now = new Date()) {
    const [user, usable, bought] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { coins: true, pawnSkin: true, diceSkin: true, boardTheme: true } }),
        usableItems(userId, now),
        prisma.purchase.findMany({ where: { userId, revokedAt: null }, select: { productId: true } }),
    ]);
    if (!user) throw new ServiceError(404, 'Player not found.');
    const equipped = Object.fromEntries(
        KINDS.map(kind => [kind, equippedItem(kind, user[EQUIP_COLUMN[kind]], usable) ?? DEFAULT_ITEM[kind]]),
    ) as Record<ItemKind, string>;
    const boughtIds = new Set(bought.map(b => b.productId));
    return {
        coins: user.coins,
        equipped,
        items: CATALOG.map(item => ({ ...item, owned: item.price === 0 || usable.has(item.id) })),
        products: PRODUCTS.map(p => ({ id: p.id, kind: p.kind, name: p.name, items: p.grants.filter(g => itemById(g)), bought: boughtIds.has(p.id) })),
        /** Remove Ads is owned: no full-screen ads. */
        noAds: usable.has(PERK.noAds),
    };
}

export type Shop = Awaited<ReturnType<typeof getShop>>;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Buys an item with coins and equips it. Coins only go down if the player has enough
 * (checked in the same statement), and the ledger's unique key stops a double-tap paying twice.
 */
export async function buyItem(userId: string, itemId: string, now = new Date()): Promise<Shop> {
    const item = itemById(itemId);
    if (!item) throw new ServiceError(404, "That item isn't in the shop.");
    if (item.price === 0) throw new ServiceError(400, 'That one is free.');
    try {
        await prisma.$transaction(async tx => {
            const owned = await tx.entitlement.findUnique({ where: { userId_itemId: { userId, itemId } } });
            if (owned && (!owned.expiresAt || owned.expiresAt > now)) throw new ServiceError(409, 'You already own this.');
            const paid = await tx.user.updateMany({
                where: { id: userId, coins: { gte: item.price } },
                data: { coins: { decrement: item.price }, [EQUIP_COLUMN[item.kind]]: item.id },
            });
            if (paid.count === 0) throw new ServiceError(400, "You don't have enough coins yet.");
            await tx.coinLedger.create({
                data: { userId, amount: -item.price, reason: 'SHOP', key: `shop:${userId}:${itemId}`, day: dayOf(now) },
            });
            // A trial that ran out becomes a purchase.
            if (owned) await tx.entitlement.update({ where: { id: owned.id }, data: { source: 'COINS', expiresAt: null } });
            else await tx.entitlement.create({ data: { userId, itemId, source: 'COINS' } });
        }, TX);
    } catch (e) {
        if (isUniqueViolation(e)) throw new ServiceError(409, 'You already own this.');
        throw e;
    }
    return getShop(userId, now);
}

/** Equips an item the player can use (a kind's default puts that kind back to normal). */
export async function equipItem(userId: string, itemId: string, now = new Date()): Promise<{ shop: Shop; kind: ItemKind; equipped: string | null }> {
    const item = itemById(itemId);
    if (!item) throw new ServiceError(404, "That item isn't in the shop.");
    if (item.price > 0 && !(await usableItems(userId, now)).has(item.id)) throw new ServiceError(403, "You don't own that yet.");
    const equipped = item.price === 0 ? null : item.id;
    await prisma.user.update({ where: { id: userId }, data: { [EQUIP_COLUMN[item.kind]]: equipped } });
    return { shop: await getShop(userId, now), kind: item.kind, equipped };
}
