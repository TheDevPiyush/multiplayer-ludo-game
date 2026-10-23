import { Router, type Request, type Response } from 'express';

import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { log } from '../lib/logger';

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN_ONLY: IceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
];

const TTL_S = 24 * 60 * 60;
type IceConfig = { iceServers: IceServer[]; expiresAt: number };

let cached: IceConfig | null = null;
let inflight: Promise<IceConfig | null> | null = null;

/** Cloudflare TURN credentials, shared by all users and refreshed before expiry. */
async function fetchCloudflare(): Promise<IceConfig | null> {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !token) return null;

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_S }),
    });
    if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`);
    const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    // Refresh an hour early so clients never receive nearly-expired credentials.
    return { iceServers: [...list, ...STUN_ONLY], expiresAt: Date.now() + (TTL_S - 3600) * 1000 };
}

async function iceServers(_req: Request, res: Response) {
    try {
        if (!cached || cached.expiresAt <= Date.now()) {
            inflight ??= fetchCloudflare().finally(() => { inflight = null; });
            cached = (await inflight) ?? { iceServers: STUN_ONLY, expiresAt: Date.now() + 60 * 60 * 1000 };
        }
        res.status(200).json({ data: cached });
    } catch (e) {
        log.error('ice-servers failed, serving STUN only', { error: (e as Error)?.message });
        res.status(200).json({ data: { iceServers: STUN_ONLY, expiresAt: Date.now() + 5 * 60 * 1000 } });
    }
}

const rtcRouter = Router();
rtcRouter.get('/ice-servers', verifySupabaseToken, iceServers);
export default rtcRouter;
