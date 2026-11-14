import { timingSafeEqual } from 'crypto';
import express, { Router, type Request, type Response } from 'express';

import { ServiceError } from '../game/game-service';
import { games } from '../game/services';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { getShop } from '../shop/shop';
import { purchasesConfigured } from './revenuecat';
import { equipProduct, revokeByTransaction, syncUser } from './sync';

const purchasesRouter = Router();

/**
 * REVENUECAT_WEBHOOK_AUTH: the "Authorization header value" set on RevenueCat's webhook
 * (Integrations → Webhooks). Without it the webhook is off.
 */
const WEBHOOK_AUTH = (process.env.REVENUECAT_WEBHOOK_AUTH ?? '').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorised(header: string | undefined): boolean {
    if (!WEBHOOK_AUTH || !header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(WEBHOOK_AUTH);
    return a.length === b.length && timingSafeEqual(a, b);
}

type WebhookEvent = {
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    transferred_from?: string[];
    transferred_to?: string[];
    transaction_id?: string;
};

/** Our accounts an event touches. RevenueCat's own anonymous ids ($RCAnonymousID:…) aren't ours. */
export function accountsIn(e: WebhookEvent): string[] {
    const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? []), ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])];
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
}

/**
 * RevenueCat's webhook. Whatever the event, each account it names is synced from RevenueCat's API,
 * so the body is only a hint. A refund (CANCELLATION) is recorded first, so the purchase stays
 * revoked even if RevenueCat still lists it. Anything but 200 makes RevenueCat retry (5 times,
 * over about 80 minutes), which is what a failed sync wants.
 */
// Its own parser: events can outgrow the app-wide 16 KB limit (index.ts skips this path).
purchasesRouter.post('/webhook', express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
    if (!authorised(req.headers.authorization)) return res.status(401).end();
    const event = (req.body?.event ?? {}) as WebhookEvent;
    try {
        if (event.type === 'CANCELLATION' && event.transaction_id) await revokeByTransaction(event.transaction_id);
        const known = await prisma.user.findMany({ where: { id: { in: accountsIn(event) } }, select: { id: true } });
        for (const { id } of known) await syncUser(id);
        log.info('purchases webhook', { type: event.type, users: known.length });
        res.status(200).end();
    } catch (e) {
        log.error('purchases webhook failed', { type: event.type, error: (e as Error)?.message });
        res.status(500).end();
    }
});

/**
 * The app calls this after a purchase or a restore: syncs from RevenueCat and returns the shop.
 * `equip`: a product just bought, whose items are equipped (as buying with coins does).
 */
purchasesRouter.post('/sync', verifySupabaseToken, rateLimit('purchases-sync', 6, 0.2), async (req: Request, res: Response) => {
    const userId = req.user!.id;
    if (!purchasesConfigured()) return res.status(503).json({ message: "Purchases aren't available yet." });
    try {
        await syncUser(userId);
        const equip = typeof req.body?.equip === 'string' ? req.body.equip : null;
        if (equip) {
            const { pawnSkin, diceSkin } = await equipProduct(userId, equip);
            if (pawnSkin || diceSkin) games.invalidateProfile(userId, { ...(pawnSkin && { pawnSkin }), ...(diceSkin && { diceSkin }) });
        }
        res.json(await getShop(userId));
    } catch (e) {
        if (e instanceof ServiceError) return res.status(e.status).json({ message: e.message });
        log.error('purchases sync failed', { user: userId, error: (e as Error)?.message });
        res.status(500).json({ message: 'Something went wrong.' });
    }
});

export default purchasesRouter;
