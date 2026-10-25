import { apiFetch, type Result } from './http';

export type VoiceToken = { url: string; token: string };

/** POST /rtc/voice-token — LiveKit URL + a token for this room's voice channel. */
export async function fetchVoiceToken(accessToken: string, roomId: string): Promise<Result<VoiceToken>> {
    const res = await apiFetch<{ data: VoiceToken }>(accessToken, '/rtc/voice-token', {
        method: 'POST',
        body: JSON.stringify({ roomId }),
    });
    return res.ok ? { ok: true, data: res.data.data } : res;
}
