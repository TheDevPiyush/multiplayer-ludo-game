import { NativeModules, Platform } from 'react-native';

export type GameMode = 'online_public' | 'online_private' | 'vs_computer' | 'pass_and_play' | 'watch_bots';

/** Everything the app measures. No usernames, chat or room codes: only what's listed here. */
type Events = {
    game_start: { mode: GameMode; players: number };
    /** `won` is left out when there's no single player to credit (Pass & Play, watching bots). */
    /** `dice`: the adaptive dice settings the game ran on ("strength/momentum/fade", or "default"). */
    game_finish: { mode: GameMode; players: number; seconds: number; won?: 0 | 1; dice: string };
    rematch: { mode: GameMode };
    invite_share: { source: 'lobby' | 'profile' };
    invite_join: Record<string, never>;
    /** `day`: place in the 7-day cycle. */
    daily_claim: { day: number; streak: number };
    mission_claim: { mission: string };
    shop_view: Record<string, never>;
    /** A shop item bought; `currency` is 'coins' until store purchases arrive. */
    purchase: { item: string; currency: 'coins'; price: number };
    shop_equip: { item: string };
};

type Firebase = typeof import('@react-native-firebase/analytics');

let firebase: Firebase | null | undefined;

/**
 * Loaded on first use, and only where it's linked: Android builds from 1.3.0 on, not iOS yet, and
 * not an older dev client, where importing it would throw. Development builds never send, so
 * testing doesn't pollute the numbers.
 */
function load(): Firebase | null {
    if (firebase !== undefined) return firebase;
    firebase = null;
    if (__DEV__ || Platform.OS !== 'android' || !NativeModules.RNFBAnalyticsModule) return null;
    try {
        firebase = require('@react-native-firebase/analytics') as Firebase;
    } catch {
        firebase = null;
    }
    return firebase;
}

/** Measuring must never disturb the game: failures here are dropped. */
function quietly(run: (fb: Firebase) => Promise<unknown>) {
    const fb = load();
    if (!fb) return;
    try {
        run(fb).catch(() => {});
    } catch {
        // Dropped on purpose, as above.
    }
}

export function track<E extends keyof Events>(name: E, params: Events[E]) {
    if (__DEV__) console.log(`[analytics] ${name}`, params);
    quietly(fb => fb.logEvent(fb.getAnalytics(), name as string, params));
}

/** Our internal user id, plus whether they're a guest, so retention can be split by the two. */
export function setAnalyticsUser(userId: string | null, isGuest: boolean) {
    quietly(async fb => {
        const analytics = fb.getAnalytics();
        await fb.setUserId(analytics, userId);
        await fb.setUserProperty(analytics, 'account', userId ? (isGuest ? 'guest' : 'saved') : null);
    });
}
