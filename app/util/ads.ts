import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, TurboModuleRegistry } from 'react-native';

import { adsRemoved } from '@/hooks/useShop';
import { remoteAds, type AdCaps } from '@/util/remote-config';

/**
 * Google AdMob (react-native-google-mobile-ads). Rewarded ads are always the player's choice;
 * full-screen ads are rare and only after a finished game. Nothing here may disturb a game:
 * every failure just means no ad.
 *
 * Unit IDs come from EXPO_PUBLIC_ADMOB_* (Android and iOS, rewarded and interstitial). Without
 * them, development builds use Google's test units and release builds show no ads at all.
 * Clicking your own live ads can get the AdMob account banned: test with test units or
 * registered test devices only.
 */

type Ads = typeof import('react-native-google-mobile-ads');

let lib: Ads | null | undefined;

/** Loaded on first use, and only where the native module is built in (a dev client from before ads has none). */
function load(): Ads | null {
    if (lib !== undefined) return lib;
    lib = null;
    if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNGoogleMobileAdsModule')) return null;
    try {
        lib = require('react-native-google-mobile-ads') as Ads;
    } catch {
        lib = null;
    }
    return lib;
}

const env = (key: string) => (process.env[key] ?? '').trim() || null;

function unitId(kind: 'rewarded' | 'interstitial'): string | null {
    const ads = load();
    if (!ads) return null;
    const id = Platform.OS === 'ios'
        ? kind === 'rewarded' ? env('EXPO_PUBLIC_ADMOB_REWARDED_IOS') : env('EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS')
        : kind === 'rewarded' ? env('EXPO_PUBLIC_ADMOB_REWARDED_ANDROID') : env('EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID');
    if (id) return id;
    if (__DEV__) return kind === 'rewarded' ? ads.TestIds.REWARDED : ads.TestIds.INTERSTITIAL;
    return null;
}

// ─── Age ─────────────────────────────────────────────────────────────────────

const AGE_KEY = 'simpleludo:age';
export type AgeAnswer = 'adult' | 'minor';
let age: AgeAnswer | null = null;

/** The player's answer to "are you 18 or older?", asked before their first rewarded ad. */
export async function savedAge(): Promise<AgeAnswer | null> {
    if (age) return age;
    try {
        const v = await AsyncStorage.getItem(AGE_KEY);
        age = v === 'adult' || v === 'minor' ? v : null;
    } catch {
        age = null;
    }
    return age;
}

export async function saveAge(answer: AgeAnswer) {
    age = answer;
    await AsyncStorage.setItem(AGE_KEY, answer).catch(() => {});
    if (started) await configure();
}

// ─── Start-up: consent, then the SDK ─────────────────────────────────────────

let started = false;
let starting: Promise<boolean> | null = null;
let canRequest = false;

/** Applies the age answer: under 18s (or not answered yet) only ever get non-personalised ads. */
async function configure() {
    const ads = load();
    if (!ads) return;
    const minor = (await savedAge()) !== 'adult';
    await ads.default().setRequestConfiguration({
        maxAdContentRating: ads.MaxAdContentRating.T,
        tagForUnderAgeOfConsent: minor,
        tagForChildDirectedTreatment: false,
    });
}

/**
 * Asks for ad consent where the law needs it (Google's consent form: EEA, UK and others), then
 * starts the SDK. Safe to call often; does the work once. Resolves to whether ads may be requested.
 */
export function startAds(): Promise<boolean> {
    starting ??= (async () => {
        const ads = load();
        if (!ads || (!unitId('rewarded') && !unitId('interstitial'))) return false;
        try {
            const minor = (await savedAge()) !== 'adult';
            const info = await ads.AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: minor });
            canRequest = info.canRequestAds;
            if (!canRequest) return false;
            await configure();
            await ads.default().initialize();
            started = true;
            return true;
        } catch {
            starting = null;
            return false;
        }
    })();
    return starting;
}

/** Whether this build can show ads at all (native module present, unit configured). */
export function adsAvailable(kind: 'rewarded' | 'interstitial' = 'rewarded'): boolean {
    return !!unitId(kind);
}

async function personalised(): Promise<boolean> {
    return (await savedAge()) === 'adult';
}

// ─── Rewarded ────────────────────────────────────────────────────────────────

export type RewardedResult = 'earned' | 'closed' | 'unavailable';

let lastRewardedAt = 0;

/**
 * Loads and shows one rewarded ad. `customData` says what it pays for (server: ads/rewards.ts) and
 * travels with Google's verification call, signed, together with `userId`.
 */
export async function showRewarded(userId: string, customData: string): Promise<RewardedResult> {
    const ads = load();
    const unit = unitId('rewarded');
    if (!ads || !unit || !(await startAds())) return 'unavailable';
    const ad = ads.RewardedAd.createForAdRequest(unit, {
        requestNonPersonalizedAdsOnly: !(await personalised()),
        serverSideVerificationOptions: { userId, customData },
    });
    return new Promise<RewardedResult>(resolve => {
        let earned = false;
        let done = false;
        const subs: (() => void)[] = [];
        const finish = (r: RewardedResult) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            subs.forEach(off => off());
            if (r === 'earned') lastRewardedAt = Date.now();
            resolve(r);
        };
        // A load that never answers (no fill, no network) gives up instead of spinning forever.
        const timeout = setTimeout(() => finish('unavailable'), 15_000);
        subs.push(
            ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
                clearTimeout(timeout);
                ad.show().catch(() => finish('unavailable'));
            }),
            ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
            ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish(earned ? 'earned' : 'closed')),
            ad.addAdEventListener(ads.AdEventType.ERROR, () => finish(earned ? 'earned' : 'unavailable')),
        );
        ad.load();
    });
}

// ─── Full-screen ads after games ─────────────────────────────────────────────

const STATE_KEY = 'simpleludo:interstitial';

export type InterstitialState = {
    /** Finished games ever, and since the last full-screen ad. */
    games: number;
    sinceLast: number;
    lastShownAt: number;
    /** India date and how many were shown that day. */
    day: string;
    today: number;
    firstSeenAt: number;
};

const DEFAULT_CAPS: AdCaps['interstitial'] = { everyGames: 3, minGapMinutes: 10, perDay: 3, graceGames: 3, graceHours: 24 };

const indiaDay = (at: number) => new Date(at + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Whether a full-screen ad may show now. Pure, so the caps are easy to check: not in a player's
 * first games or hours, only every few games, spaced out, a few a day, and never right after
 * they chose to watch a rewarded ad.
 */
export function interstitialDue(s: InterstitialState, caps: AdCaps['interstitial'], now: number, lastRewarded: number): boolean {
    if (s.games < caps.graceGames || now - s.firstSeenAt < caps.graceHours * 3_600_000) return false;
    if (s.sinceLast < caps.everyGames) return false;
    if (now - s.lastShownAt < caps.minGapMinutes * 60_000) return false;
    if (s.day === indiaDay(now) && s.today >= caps.perDay) return false;
    return now - lastRewarded > 3 * 60_000;
}

async function readState(now: number): Promise<InterstitialState> {
    try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (raw) return JSON.parse(raw) as InterstitialState;
    } catch {
        // Start over.
    }
    return { games: 0, sinceLast: 0, lastShownAt: 0, day: indiaDay(now), today: 0, firstSeenAt: now };
}

const writeState = (s: InterstitialState) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {});

type Interstitial = ReturnType<Ads['InterstitialAd']['createForAdRequest']>;
let ready: Interstitial | null = null;

/**
 * A game just finished: counts it, and when an ad will be due on leaving the result screen,
 * starts loading it so leaving never waits for one.
 */
export async function noteGameFinished() {
    const now = Date.now();
    const s = await readState(now);
    s.games++;
    s.sinceLast++;
    await writeState(s);
    const ads = load();
    const unit = unitId('interstitial');
    if (!ads || !unit || ready || adsRemoved() || !interstitialDue(s, caps(), now, lastRewardedAt)) return;
    if (!(await startAds())) return;
    const ad = ads.InterstitialAd.createForAdRequest(unit, { requestNonPersonalizedAdsOnly: !(await personalised()) });
    const offLoaded = ad.addAdEventListener(ads.AdEventType.LOADED, () => { ready = ad; offLoaded(); });
    ad.load();
}

/**
 * The player is leaving a finished game's result screen (not for a rematch): shows the loaded ad
 * if one is still due. Never waits for one to load.
 */
export async function leavingResult(): Promise<boolean> {
    const ad = ready;
    const ads = load();
    if (!ad || !ads || adsRemoved()) return false;
    const now = Date.now();
    const s = await readState(now);
    if (!interstitialDue(s, caps(), now, lastRewardedAt)) return false;
    ready = null;
    try {
        await ad.show();
    } catch {
        return false;
    }
    const day = indiaDay(now);
    await writeState({ ...s, sinceLast: 0, lastShownAt: now, day, today: s.day === day ? s.today + 1 : 1 });
    return true;
}

function caps(): AdCaps['interstitial'] {
    return remoteAds()?.interstitial ?? DEFAULT_CAPS;
}
