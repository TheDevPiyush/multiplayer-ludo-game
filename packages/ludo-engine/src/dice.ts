import { evaluateMove, getPlayer, leaderOf, movableTokens, racingPlayers } from './analysis';
import { HOME_POS, progress } from './board';
import type { BalanceConfig, Color, GameState, PlayerState, Rng } from './types';

/** Every face keeps at least this probability, so the dice never feel scripted. */
export const MIN_FACE_P = 0.08;
export const MAX_FACE_P = 0.36;

export const DEFAULT_BALANCE: BalanceConfig = {
    enabled: true,
    strength: 0.6,
    pityAfter: 4,
    momentum: 1.5,
    luckFade: 0.8,
};

/** A progress gap of this size gives the full balancing effect. */
const FULL_EFFECT_GAP = 0.2;
/** A luck score this far from 0 counts as fully hot or cold. */
const FULL_LUCK = 2;
/** Luck never goes past this, so a very long run can't take long to cool. */
const LUCK_LIMIT = 3;
/** A six rolls again, so it's worth having even when nothing special happens. */
const SIX_VALUE = 0.4;
/** How much each pip above or below the average is worth. Lets the dice ease off, not only deny captures. */
const PIP_VALUE = 0.1;

const UNIFORM = [1, 1, 1, 1, 1, 1].map(w => w / 6);

/**
 * How good a face would be for `color` right now.
 * > 0 = helpful (capture, home, leave base, escape), < 0 = wasted roll.
 */
export function faceValue(state: GameState, color: Color, face: number): number {
    const player = getPlayer(state, color);
    if (!player) return 0;
    const tokens = movableTokens(player, face);
    if (tokens.length === 0) return -0.4;

    const leader = leaderOf(state);
    let best = face === 6 && state.rules.extraRollOnSix ? SIX_VALUE : 0;
    for (const token of tokens) {
        const o = evaluateMove(state, color, token, face);
        if (!o) continue;
        let v = 0;
        if (o.captures.length > 0) {
            v = 1;
            if (o.captures.some(c => c.color === leader && leader !== color)) v += 0.5;
        } else if (o.reachesHome) v = 0.7;
        else if (o.leavesBase) v = 0.6;
        else if (o.escapes) v = 0.5;
        else if (o.landsSafe) v = 0.15;
        best = Math.max(best, v);
    }
    return best + (face - 3.5) * PIP_VALUE;
}

/**
 * Scales `p` to sum to 1 with every face inside the limits. Faces past a limit are pinned to it and
 * the rest share what's left, so the limits hold exactly. Each pass pins at least one face.
 */
function clampDistribution(p: number[]): number[] {
    const pinned: (number | null)[] = p.map(() => null);
    for (;;) {
        const left = 1 - pinned.reduce<number>((s, x) => s + (x ?? 0), 0);
        const freeSum = p.reduce((s, x, i) => s + (pinned[i] === null ? x : 0), 0);
        const out = p.map((x, i) => pinned[i] ?? (x * left) / freeSum);

        let under = 0;
        let over = 0;
        out.forEach((x, i) => {
            if (pinned[i] !== null) return;
            under += Math.max(0, MIN_FACE_P - x);
            over += Math.max(0, x - MAX_FACE_P);
        });
        if (under === 0 && over === 0) return out;

        // Pin only the side that's further out: fixing one side can bring the other back inside.
        out.forEach((x, i) => {
            if (pinned[i] !== null) return;
            if (under >= over && x < MIN_FACE_P) pinned[i] = MIN_FACE_P;
            if (over > under && x > MAX_FACE_P) pinned[i] = MAX_FACE_P;
        });
    }
}

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/**
 * Whether the dice should ease off or help this player: +1 = ease off fully, -1 = help fully.
 * Weighs how far ahead they are against how lucky they've been lately, so a player on a hot run
 * cools for a few turns even in a close race, and the pressure fades by itself.
 */
export function dicePressure(state: GameState, color: Color): number {
    const player = getPlayer(state, color);
    if (!player) return 0;
    const opponents = racingPlayers(state).filter(p => p.color !== color);
    if (opponents.length === 0) return 0;

    const avg = opponents.reduce((s, p) => s + progress(p), 0) / opponents.length;
    const standing = clamp((progress(player) - avg) / FULL_EFFECT_GAP, -1, 1);
    const hot = clamp((player.luck ?? 0) / FULL_LUCK, -1, 1);
    return clamp(standing + hot * (state.balance.momentum ?? DEFAULT_BALANCE.momentum!), -1, 1);
}

/** How strongly the dice act on this roll: gentle early on, firmer as someone nears the finish. */
function rollStrength(state: GameState): number {
    const furthest = Math.max(...racingPlayers(state).map(progress), 0);
    return state.balance.strength * (0.8 + 0.4 * furthest);
}

/**
 * Probability of each face (index 0 = face 1) for the player about to roll.
 *
 * Players under pressure (see `dicePressure`) get less weight on faces that help them and more on
 * wasted rolls; players who need help get the reverse. Pity and anti-streak adjust the six.
 */
export function diceProbabilities(state: GameState, color: Color): number[] {
    const { enabled, strength, pityAfter } = state.balance;
    const player = getPlayer(state, color);
    if (!enabled || strength <= 0 || !player) return [...UNIFORM];

    const pressure = dicePressure(state, color);
    const effect = pressure * rollStrength(state) * 1.4;
    const weights = [1, 2, 3, 4, 5, 6].map(face => Math.max(0.05, 1 - effect * faceValue(state, color, face)));

    const allInBase = player.tokens.every(t => t === 0);
    if (allInBase && player.rollsWithoutSix >= pityAfter) {
        const over = player.rollsWithoutSix - pityAfter + 1;
        weights[5]! *= 1 + Math.min(2, 0.6 * over) * strength;
    }

    if (state.turn === color && state.sixStreak > 0) {
        weights[5]! *= state.sixStreak >= 2 ? 1 - 0.5 * strength : 1 - 0.3 * strength;
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    return clampDistribution(weights.map(w => w / sum));
}

export function rollDice(state: GameState, color: Color, rng: Rng): number {
    const probs = diceProbabilities(state, color);
    let r = rng();
    for (let i = 0; i < 6; i++) {
        r -= probs[i]!;
        if (r < 0) return i + 1;
    }
    return 6;
}

const isAdapting = (state: GameState) => state.balance.enabled && state.balance.strength > 0;

/** `color`'s luck once they've rolled `value`: the old score fades, then the roll adds how much better than average it was. */
export function afterRoll(state: GameState, color: Color, value: number): number {
    const player = getPlayer(state, color);
    if (!player || !isAdapting(state)) return 0;
    const faces = [1, 2, 3, 4, 5, 6].map(face => faceValue(state, color, face));
    const average = faces.reduce((a, b) => a + b, 0) / 6;
    const fade = state.balance.luckFade ?? DEFAULT_BALANCE.luckFade!;
    return clamp((player.luck ?? 0) * fade + faces[value - 1]! - average, -LUCK_LIMIT, LUCK_LIMIT);
}

/** A captured player's luck: losing a token counts as bad luck, more so the further it had come. */
export function afterCapture(state: GameState, player: PlayerState, tokenPos: number): number {
    if (!isAdapting(state)) return 0;
    return clamp((player.luck ?? 0) - 0.3 - 0.7 * (tokenPos / HOME_POS), -LUCK_LIMIT, LUCK_LIMIT);
}
