import { Router, type Request, type Response } from 'express';

import { ServiceError } from '../game/game-service';
import { log } from '../lib/logger';
import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { publicConfig } from './config';
import { claimDaily, claimMission, getProgress, reportOfflineGame } from './progress';

// Coins, XP, the daily reward and missions. Guests use them too.
const progressRouter = Router();

function handle(name: string, fn: (req: Request, res: Response) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            res.json(await fn(req, res));
        } catch (e) {
            if (e instanceof ServiceError) return res.status(e.status).json({ message: e.message });
            log.error(`${name} failed`, { user: req.user?.id, error: (e as Error)?.message });
            return res.status(500).json({ message: 'Something went wrong.' });
        }
    };
}

progressRouter.get('/', verifySupabaseToken, handle('getProgress', req => getProgress(req.user!.id)));
progressRouter.post('/daily/claim', verifySupabaseToken, rateLimit('progress-claim', 10, 1),
    handle('claimDaily', req => claimDaily(req.user!.id)));
progressRouter.post('/missions/:id/claim', verifySupabaseToken, rateLimit('progress-claim', 10, 1),
    handle('claimMission', req => claimMission(req.user!.id, String(req.params.id))));
progressRouter.post('/offline-game', verifySupabaseToken, rateLimit('offline-game', 5, 0.1),
    handle('reportOfflineGame', req => reportOfflineGame(req.user!.id, req.body)));

/** Tunable values for the app (dice, rewards). Public, and cacheable for a few minutes. */
export function getConfig(_: Request, res: Response) {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(publicConfig());
}

export default progressRouter;
