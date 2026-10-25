import { evaluateMove, getPlayer, leaderOf, movableTokens, racingPlayers } from './analysis';
import { progress } from './board';
import type { Color, GameState, Rng } from './types';

/** Every face keeps at least this probability, so the dice never feel scripted. */
export const MIN_FACE_P = 0.08;
export const MAX_FACE_P = 0.36;

/** A progress gap of this size gives the full balancing effect. */
const FULL_EFFECT_GAP = 0.2;

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
    let best = 0;
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
    return best;
}

function clampDistribution(p: number[]): number[] {
    let out = p;
    // A couple of passes converges well enough for 6 faces.
    for (let pass = 0; pass < 4; pass++) {
        out = out.map(x => Math.min(MAX_FACE_P, Math.max(MIN_FACE_P, x)));
        const sum = out.reduce((a, b) => a + b, 0);
        out = out.map(x => x / sum);
    }
    return out;
}

/**
 * Probability of each face (index 0 = face 1) for the player about to roll.
 *
 * Trailing players get more weight on faces that help them right now; the leader
 * gets less, and more weight on wasted rolls. Pity and anti-streak adjust the six.
 */
export function diceProbabilities(state: GameState, color: Color): number[] {
    const { enabled, strength, pityAfter } = state.balance;
    const player = getPlayer(state, color);
    if (!enabled || strength <= 0 || !player) return [...UNIFORM];

    const weights = [1, 1, 1, 1, 1, 1];

    const opponents = racingPlayers(state).filter(p => p.color !== color);
    if (opponents.length > 0) {
        const avg = opponents.reduce((s, p) => s + progress(p), 0) / opponents.length;
        // +1 = clearly leading, -1 = clearly trailing.
        const standing = Math.max(-1, Math.min(1, (progress(player) - avg) / FULL_EFFECT_GAP));
        for (let face = 1; face <= 6; face++) {
            const v = faceValue(state, color, face);
            weights[face - 1] = Math.max(0.05, 1 - standing * v * strength * 1.4);
        }
    }

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
