import { Router, type Request, type Response } from 'express';

import { ServiceError } from '../game/game-service';
import { log } from '../lib/logger';
import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { ADS } from '../progress/config';
import { getIO } from '../socket/socket-server';
import { grantAdReward, parseCustomData } from './rewards';
import { parseSsvQuery, verifierKey, verifySsv } from './ssv';

const adsRouter = Router();

/** Tells the player's open apps a reward landed (it usually arrives a moment after the ad closes). */
function announce(userId: string, placement: string, ref: string, coins: number) {
    getIO()?.to(`user:${userId}`).emit('ads:reward', { placement, ref, coins });
}

/**
 * Google's verification call for a rewarded ad (the URL set on each rewarded ad unit in AdMob).
 * A wrong signature is refused. A correctly signed call is answered 200 even when nothing is paid
 * (already paid, over a cap), or Google would keep retrying it.
 */
adsRouter.get('/ssv', rateLimit('ads-ssv', 60, 20), async (req: Request, res: Response) => {
    const raw = req.originalUrl.split('?')[1] ?? '';
    const call = parseSsvQuery(raw);
    // Google's "verify URL" check in the AdMob console sends no reward; it only needs a 200.
    if (!call) return res.status(raw ? 400 : 200).end();
    const key = await verifierKey(call.keyId);
    if (!key || !verifySsv(call, key)) {
        log.warn('ad verification failed', { keyId: call.keyId });
        return res.status(400).end();
    }
    const userId = call.params.get('user_id');
    const reward = parseCustomData(call.params.get('custom_data'));
    if (!userId || !reward) {
        log.warn('ad verification without a usable reward', { tx: call.params.get('transaction_id') });
        return res.status(200).end();
    }
    try {
        const { coins } = await grantAdReward(userId, reward.placement, reward.ref);
        announce(userId, reward.placement, reward.ref, coins);
    } catch (e) {
        if (e instanceof ServiceError) log.info('ad reward not paid', { user: userId, placement: reward.placement, reason: e.message });
        else log.error('ad reward failed', { user: userId, placement: reward.placement, error: (e as Error)?.message });
    }
    res.status(200).end();
});

/**
 * Development only (ADS_TRUST_CLIENT): Google's test ads never call `/ssv`, so the app claims the
 * reward itself after a test ad. Off in production, where only `/ssv` pays.
 */
adsRouter.post('/claim', verifySupabaseToken, rateLimit('ads-claim', 10, 0.5), async (req: Request, res: Response) => {
    if (!ADS.trustClient) return res.status(404).json({ message: 'Not found.' });
    const reward = parseCustomData(String(req.body?.customData ?? ''));
    if (!reward) return res.status(400).json({ message: 'Unknown reward.' });
    try {
        const out = await grantAdReward(req.user!.id, reward.placement, reward.ref);
        announce(req.user!.id, reward.placement, reward.ref, out.coins);
        res.json(out);
    } catch (e) {
        if (e instanceof ServiceError) return res.status(e.status).json({ message: e.message });
        log.error('ad claim failed', { user: req.user?.id, error: (e as Error)?.message });
        res.status(500).json({ message: 'Something went wrong.' });
    }
});

export default adsRouter;
