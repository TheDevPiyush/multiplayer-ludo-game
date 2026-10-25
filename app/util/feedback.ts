import * as Haptics from 'expo-haptics';

import { HOP_MS } from '@/components/ludo/geometry';
import { getAudioSettings, playEffect } from './audio';

// What the player hears and feels for each game event, timed to the board's animations.

const guard = (run: () => Promise<void>) => () => {
    if (getAudioSettings().haptics) run().catch(() => {});
};

export const haptic = {
    tick: guard(() => Haptics.selectionAsync()),
    light: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    medium: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    heavy: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
    success: guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};

/** The engine events boards react to (the same shape online and offline). */
type FeedbackEvent =
    | { type: 'MOVED'; color: string; from: number; to: number; path: number[] }
    | { type: 'CAPTURED'; color: string; by: string }
    | { type: 'TURN'; color: string; reason: string }
    | { type: 'OVER'; ranking: string[] }
    | { type: string };

/** Last cell of the home column: the pawn is home. */
const HOME_POS = 57;
/** Leaving base is one big hop (Token.tsx). */
const LEAVE_BASE_MS = 260;
/** Someone else's capture is news, not your moment. */
const SPECTATOR_GAIN = 0.6;

/**
 * Sounds and haptics for one batch of game events. `isMine(color)` is true for
 * colors played on this device (haptics and "your turn" only fire for those).
 */
export function feedbackForEvents(events: FeedbackEvent[], isMine: (color: string) => boolean) {
    const at = (ms: number, fn: () => void) => (ms > 0 ? setTimeout(fn, ms) : fn());
    /** When the moving pawn lands (a capture happens then). */
    let landsAt = 0;

    for (const e of events) {
        if (e.type === 'MOVED' && 'path' in e) {
            // A jump as each hop takes off, one landing when the pawn settles.
            if (e.from === 0) {
                landsAt = LEAVE_BASE_MS;
                playEffect('hop');
            } else {
                const hops = Math.max(1, Math.min(6, e.path.length));
                for (let i = 0; i < hops; i++) at(i * HOP_MS, () => playEffect('hop'));
                landsAt = hops * HOP_MS;
            }
            at(landsAt, () => playEffect('land'));
            if (e.to === HOME_POS) {
                at(landsAt + 120, () => {
                    playEffect('home');
                    if (isMine(e.color)) haptic.light();
                });
            }
        } else if (e.type === 'CAPTURED' && 'by' in e) {
            at(landsAt, () => {
                if (isMine(e.color) && !isMine(e.by)) {
                    playEffect('captured');
                    haptic.heavy();
                } else if (isMine(e.by)) {
                    playEffect('capture');
                    haptic.success();
                } else {
                    playEffect('capture', SPECTATOR_GAIN);
                }
            });
        } else if (e.type === 'TURN' && 'reason' in e) {
            if (e.reason !== 'extra-roll' && isMine(e.color)) {
                playEffect('turn');
                haptic.light();
            }
        } else if (e.type === 'OVER' && 'ranking' in e) {
            const won = !!e.ranking[0] && isMine(e.ranking[0]);
            playEffect(won ? 'win' : 'over');
            if (won) haptic.success();
        }
    }
}
