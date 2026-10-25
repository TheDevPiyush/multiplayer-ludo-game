import { Router, type Request, type Response } from 'express';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

import { games } from '../game/services';
import { log } from '../lib/logger';
import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { voiceRoomName } from './livekit';

const TOKEN_TTL = '6h';

/**
 * POST /rtc/voice-token { roomId } → { url, token }
 * Only members of an open voice-enabled room get a token, and it can publish the microphone only.
 */
async function voiceToken(req: Request, res: Response) {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
        log.error('voice-token: LIVEKIT_* env not set');
        return res.status(503).json({ message: 'Voice chat is not available right now.' });
    }

    const userId = req.user!.id;
    const roomId = String(req.body?.roomId ?? '');
    const room = roomId ? await games.getRoom({ id: roomId }) : null;
    if (!room || !games.isMember(room, userId)) return res.status(404).json({ message: 'Room not found.' });
    if (!room.voiceEnabled) return res.status(403).json({ message: 'Voice chat is off for this room.' });
    if (room.status === 'FINISHED' || room.status === 'CANCELLED') {
        return res.status(410).json({ message: 'This room is closed.' });
    }

    const player = room.players.find(p => p.userId === userId);
    const at = new AccessToken(apiKey, apiSecret, { identity: userId, name: player?.username ?? undefined, ttl: TOKEN_TTL });
    at.addGrant({
        room: voiceRoomName(room.id),
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
    });

    res.status(200).json({ data: { url, token: await at.toJwt() } });
}

const rtcRouter = Router();
rtcRouter.post('/voice-token', verifySupabaseToken, rateLimit('voice-token', 10, 0.5), (req, res) => {
    voiceToken(req, res).catch(e => {
        log.error('voice-token failed', { user: req.user?.id, error: (e as Error)?.message });
        res.status(500).json({ message: 'Could not start voice chat.' });
    });
});
export default rtcRouter;
