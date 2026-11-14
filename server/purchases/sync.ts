import { Prisma } from '../generated/prisma/client.ts';
import { ServiceError } from '../game/game-service';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { EQUIP_COLUMN, itemById } from '../shop/catalog';
import { productById } from '../shop/products';
import { fetchPurchases, type StorePurchase } from './revenuecat';

const TX = { timeout: 20_000, maxWait: 10_000 };
type Tx = Prisma.TransactionClient;
type StoreSource = 'PLAY' | 'APPSTORE';

/** RevenueCat's store names we sell through. Others (promotional, web) aren't ours to grant from. */
const SOURCE: Record<string, StoreSource> = { play_store: 'PLAY', app_store: 'APPSTORE', mac_app_store: 'APPSTORE' };
const isStoreSource = (s: string) => s === 'PLAY' || s === 'APPSTORE';

/** The entitlement a purchase made for one item. */
const grantKey = (rcId: string, itemId: string) => `rc:${rcId}:${itemId}`;

/**
 * Makes one account's store-made entitlements match its active purchases. It grants what they
 * include, unless already owned another way (bought with coins stays as it is), and takes away
 * what no active purchase covers any more: a refund, or a restore that moved it to another
 * account. Idempotent, so every sync and webhook can simply run it.
 */
async function reconcile(tx: Tx, userId: string) {
    const active = await tx.purchase.findMany({ where: { userId, revokedAt: null }, orderBy: { purchasedAt: 'asc' } });
    const want = new Map<string, { rcId: string; source: StoreSource }>();
    for (const p of active) {
        const product = productById(p.productId);
        const source = SOURCE[p.store];
        if (!product || !source) continue;
        for (const itemId of product.grants) if (!want.has(itemId)) want.set(itemId, { rcId: p.rcId, source });
    }

    const have = await tx.entitlement.findMany({ where: { userId } });
    const stale = have.filter(e => isStoreSource(e.source) && !want.has(e.itemId)).map(e => e.id);
    if (stale.length) await tx.entitlement.deleteMany({ where: { id: { in: stale } } });

    const byItem = new Map(have.map(e => [e.itemId, e]));
    for (const [itemId, g] of want) {
        const e = byItem.get(itemId);
        const data = { source: g.source, externalId: grantKey(g.rcId, itemId), expiresAt: null };
        if (!e) await tx.entitlement.create({ data: { userId, itemId, ...data } });
        // A trial becomes owned; a grant whose purchase changed points at the one that covers it now.
        else if (e.expiresAt || (isStoreSource(e.source) && e.externalId !== data.externalId)) {
            await tx.entitlement.update({ where: { id: e.id }, data });
        }
    }
}

/**
 * Records what RevenueCat lists for this account and grants it. `list` must be the account's
 * complete list: anything held here but missing from it has moved to another account (a restore
 * there) and is let go until that account syncs.
 */
export async function applyPurchases(userId: string, list: StorePurchase[]): Promise<void> {
    const ours = list.filter(p => productById(p.productId) && SOURCE[p.store]);
    if (ours.length < list.length) {
        const other = list.filter(p => !ours.includes(p)).map(p => `${p.store}:${p.productId}`);
        log.warn('purchases: not ours to grant', { user: userId, purchases: other.join(',') });
    }
    await prisma.$transaction(async tx => {
        // A webhook and the app's sync often arrive together for one account: one at a time.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`purchases:${userId}`}))`;
        if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }))) return;

        const previous = new Set<string>();
        for (const p of ours) {
            const row = await tx.purchase.findUnique({ where: { rcId: p.rcId } });
            if (!row) {
                await tx.purchase.create({
                    data: {
                        userId,
                        rcId: p.rcId,
                        productId: p.productId,
                        store: p.store,
                        sandbox: p.sandbox,
                        purchasedAt: p.purchasedAt,
                        storeTransactionId: p.storeTransactionId,
                    },
                });
            } else if (row.userId !== userId || (!row.storeTransactionId && p.storeTransactionId)) {
                // Moved here by a restore on this account.
                if (row.userId && row.userId !== userId) previous.add(row.userId);
                await tx.purchase.update({
                    where: { id: row.id },
                    data: { userId, storeTransactionId: row.storeTransactionId ?? p.storeTransactionId },
                });
            }
        }
        await tx.purchase.updateMany({
            where: { userId, rcId: { notIn: ours.map(p => p.rcId) } },
            data: { userId: null },
        });
        // The account it came from loses those grants first: an entitlement's key is unique.
        for (const other of previous) await reconcile(tx, other);
        await reconcile(tx, userId);
    }, TX);
}

/** Asks RevenueCat for the account's purchases and grants them. */
export async function syncUser(userId: string): Promise<void> {
    const list = await fetchPurchases(userId);
    if (!list) throw new ServiceError(503, "Couldn't reach the store just now. Try again in a moment.");
    await applyPurchases(userId, list);
}

/**
 * A refund (RevenueCat's CANCELLATION of a one-time purchase): the purchase grants nothing from
 * now on. Returns the account that held it, or undefined when it isn't known here.
 */
export async function revokeByTransaction(storeTransactionId: string, now = new Date()): Promise<string | null | undefined> {
    return prisma.$transaction(async tx => {
        const row = await tx.purchase.findUnique({ where: { storeTransactionId } });
        if (!row) return undefined;
        if (!row.revokedAt) await tx.purchase.update({ where: { id: row.id }, data: { revokedAt: now } });
        if (row.userId) await reconcile(tx, row.userId);
        log.info('purchase revoked', { user: row.userId, product: row.productId });
        return row.userId;
    }, TX);
}

/**
 * Equips what a product includes, as buying with coins does. Only items the account owns now.
 * Returns what changed, so rooms can show the new pawn and dice.
 */
export async function equipProduct(userId: string, productId: string): Promise<{ pawnSkin?: string; diceSkin?: string }> {
    const product = productById(productId);
    if (!product) return {};
    const owned = new Set((await prisma.entitlement.findMany({
        where: { userId, itemId: { in: product.grants }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { itemId: true },
    })).map(e => e.itemId));
    const data: Record<string, string> = {};
    for (const id of product.grants) {
        const item = itemById(id);
        if (item && owned.has(id)) data[EQUIP_COLUMN[item.kind]] = id;
    }
    if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data });
    return { pawnSkin: data.pawnSkin, diceSkin: data.diceSkin };
}
