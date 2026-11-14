import { Router, type Request, type Response } from 'express';

import { ServiceError } from '../game/game-service';
import { games } from '../game/services';
import { log } from '../lib/logger';
import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { buyItem, equipItem, getShop } from './shop';

// Cosmetics for coins. Guests use it too: their coins are theirs to spend.
const shopRouter = Router();
shopRouter.use(verifySupabaseToken);

function handle(name: string, fn: (req: Request) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            res.json(await fn(req));
        } catch (e) {
            if (e instanceof ServiceError) return res.status(e.status).json({ message: e.message });
            log.error(`${name} failed`, { user: req.user?.id, error: (e as Error)?.message });
            return res.status(500).json({ message: 'Something went wrong.' });
        }
    };
}

/** Rooms show the new pawn or dice from the next update on. */
function showInRooms(userId: string, kind: string, itemId: string | null) {
    if (kind === 'pawn') games.invalidateProfile(userId, { pawnSkin: itemId });
    else if (kind === 'dice') games.invalidateProfile(userId, { diceSkin: itemId });
}

shopRouter.get('/', handle('getShop', req => getShop(req.user!.id)));

shopRouter.post('/items/:id/buy', rateLimit('shop-buy', 5, 0.5), handle('buyItem', async req => {
    const itemId = String(req.params.id);
    const shop = await buyItem(req.user!.id, itemId);
    const item = shop.items.find(i => i.id === itemId)!;
    showInRooms(req.user!.id, item.kind, itemId);
    return shop;
}));

shopRouter.post('/items/:id/equip', rateLimit('shop-equip', 10, 1), handle('equipItem', async req => {
    const { shop, kind, equipped } = await equipItem(req.user!.id, String(req.params.id));
    showInRooms(req.user!.id, kind, equipped);
    return shop;
}));

export default shopRouter;
