import { DEFAULT_BALANCE } from '@ludo/engine';

/**
 * Values the daily loop and the dice run on. The app reads them from `GET /config`, so changing
 * them here (or the dice through env) needs a server deploy, not an app release.
 */
export const PROGRESS = {
    /** Online games, checked by the server. */
    game: {
        finishCoins: 15,
        winCoins: 40,
        finishXp: 20,
        winXp: 50,
        /** Coins from games per day (India time). XP has no cap. */
        dailyCoinCap: 300,
    },
    /** Vs Computer, reported by the app, so smaller and capped by count. */
    offline: {
        finishCoins: 5,
        winCoins: 10,
        finishXp: 10,
        winXp: 20,
        gamesPerDay: 10,
    },
    /** Shorter games, or players who made fewer moves, earn nothing (stops quick farming). */
    minGameSeconds: 120,
    minMoves: 5,
    /** Coins for each level gained. */
    levelUpCoins: 50,
    /** Daily reward by day of the India week, Monday first; a missed day just loses its coins. */
    dailyRewards: [20, 30, 40, 50, 60, 80, 150],
    missionsPerDay: 3,
    /**
     * Bringing in a new player: when a player in their first `newForDays` days finishes a private
     * game hosted by someone with a saved account who joined before them, both get `coins`. Once
     * per new player; a host gets it at most `perWeek` times a week (stops farming with spare accounts).
     */
    invite: { coins: 100, newForDays: 7, perWeek: 5 },
} as const;

/**
 * Ads. Rewarded ads are always the player's choice and pay through Google's server-side
 * verification (ads/). Full-screen ads are rare, only after a finished game, and their caps are
 * applied by the app (it reads them from `/config`).
 */
export const ADS = {
    rewarded: {
        /** Doubling a game's coins, per day. */
        doublePerDay: 5,
        /** Collecting a missed day of the daily reward, per week. */
        missedPerWeek: 1,
    },
    interstitial: {
        /** At most one per this many finished games… */
        everyGames: 3,
        /** …this far apart… */
        minGapMinutes: 10,
        /** …and this many a day. */
        perDay: 3,
        /** None in a player's first games or first hours. */
        graceGames: 3,
        graceHours: 24,
    },
    /**
     * Development only: lets the app claim a reward itself, because Google's test ads never
     * call the verification URL. Never on in production.
     */
    trustClient: process.env.ADS_TRUST_CLIENT === 'true' && process.env.NODE_ENV !== 'production',
};

/** The adaptive dice, for online games and (through `/config`) the app's offline games. */
export const DICE = {
    strength: Number(process.env.DICE_BALANCE_STRENGTH ?? DEFAULT_BALANCE.strength),
    momentum: Number(process.env.DICE_MOMENTUM ?? DEFAULT_BALANCE.momentum),
    luckFade: Number(process.env.DICE_LUCK_FADE ?? DEFAULT_BALANCE.luckFade),
};

/** What `GET /config` serves. Nothing here is secret. */
export function publicConfig() {
    return {
        dice: DICE,
        rewards: {
            game: PROGRESS.game,
            offline: PROGRESS.offline,
            levelUpCoins: PROGRESS.levelUpCoins,
            dailyRewards: PROGRESS.dailyRewards,
            invite: PROGRESS.invite,
        },
        ads: { rewarded: ADS.rewarded, interstitial: ADS.interstitial, trustClient: ADS.trustClient },
    };
}
