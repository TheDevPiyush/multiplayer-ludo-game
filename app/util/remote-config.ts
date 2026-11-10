import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BalanceConfig } from '@ludo/engine';

import { fetchRemoteConfig, type RemoteConfig } from '@/apis/progress-api';

const KEY = 'simpleludo:remote-config';

let current: RemoteConfig = {};

const isNum = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

/** Keeps only values that make sense, so a bad response can't break offline games. */
function clean(raw: unknown): RemoteConfig {
    const r = (raw ?? {}) as RemoteConfig;
    const out: RemoteConfig = {};
    const dice = r.dice;
    if (dice && isNum(dice.strength, 0, 1) && isNum(dice.momentum, 0, 5) && isNum(dice.luckFade, 0, 1)) {
        out.dice = { strength: dice.strength, momentum: dice.momentum, luckFade: dice.luckFade };
    }
    const inviteCoins = r.rewards?.invite?.coins;
    if (isNum(inviteCoins, 1, 10_000)) out.rewards = { invite: { coins: inviteCoins! } };
    return out;
}

/**
 * Loads the server's tuning (`GET /config`): the saved copy first, then a fresh one. Offline
 * games use whatever is loaded when they start; with nothing loaded, the engine's defaults.
 */
export async function loadRemoteConfig() {
    try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved) current = clean(JSON.parse(saved));
    } catch {
        // A broken saved copy is replaced below.
    }
    const fresh = await fetchRemoteConfig();
    if (!fresh) return;
    current = clean(fresh);
    void AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

/** The dice settings for an offline game, or undefined for the engine's defaults. */
export function diceBalance(): Partial<BalanceConfig> | undefined {
    const d = current.dice;
    return d ? { enabled: d.strength > 0, strength: d.strength, momentum: d.momentum, luckFade: d.luckFade } : undefined;
}

/** Coins a host and a new player each get for the new player's first private game. */
export function inviteCoins(): number {
    return current.rewards?.invite?.coins ?? 100;
}

/** The dice settings as one short label, for analytics ("0.6/1.5/0.8", or "default"). */
export function diceLabel(): string {
    const d = current.dice;
    return d ? `${d.strength}/${d.momentum}/${d.luckFade}` : 'default';
}
