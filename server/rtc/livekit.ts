import { RoomServiceClient } from 'livekit-server-sdk';

import { log } from '../lib/logger';

/** LiveKit room per game room; both sides only ever see this name through the token. */
export const voiceRoomName = (roomId: string) => `ludo-${roomId}`;

let roomService: RoomServiceClient | null | undefined;

/** LiveKit's server API; null when voice isn't configured. */
function livekitRooms(): RoomServiceClient | null {
    if (roomService !== undefined) return roomService;
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    roomService = url && apiKey && apiSecret
        ? new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret)
        : null;
    return roomService;
}

/**
 * Ends a game room's voice channel after `delayMs`, disconnecting anyone still
 * in it. LiveKit bills every connected minute, so a closed room shouldn't linger
 * because an app stayed open on the results screen.
 */
export function closeVoiceRoom(roomId: string, delayMs = 0) {
    const rooms = livekitRooms();
    if (!rooms) return;
    const close = () => {
        rooms.deleteRoom(voiceRoomName(roomId)).catch(e => {
            // 404 when nobody ever joined voice — nothing to close.
            log.debug('voice room close skipped', { room: roomId, error: (e as Error)?.message });
        });
    };
    if (delayMs <= 0) return close();
    setTimeout(close, delayMs).unref?.();
}
