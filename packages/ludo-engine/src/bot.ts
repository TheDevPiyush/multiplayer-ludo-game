import { evaluateMove, leaderOf, legalMoves } from './analysis';
import { HOME_POS } from './board';
import type { GameState, Rng } from './types';

export type BotLevel = 'easy' | 'medium' | 'hard';

/** Heuristic score of moving `token` with the current dice. Higher is better. */
export function scoreMove(state: GameState, token: number): number {
    const dice = state.dice;
    if (dice === null) return -Infinity;
    const o = evaluateMove(state, state.turn, token, dice);
    if (!o) return -Infinity;

    const leader = leaderOf(state);
    let score = (o.to / HOME_POS) * 10;
    if (o.captures.length > 0) {
        score += 100;
        if (o.captures.some(c => c.color === leader)) score += 20;
    }
    if (o.reachesHome) score += 80;
    if (o.leavesBase) score += 60;
    if (o.escapes) score += 50;
    if (o.landsSafe) score += 20;
    if (o.entersDanger) score -= 35;
    return score;
}

/** Picks a token to move, or null when no legal move exists. */
export function chooseMove(state: GameState, level: BotLevel = 'medium', rng: Rng = Math.random): number | null {
    const moves = legalMoves(state);
    if (moves.length === 0) return null;
    if (level === 'easy' && rng() < 0.5) return moves[Math.floor(rng() * moves.length)]!;

    const noise = level === 'medium' ? 25 : 0;
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const token of moves) {
        const s = scoreMove(state, token) + rng() * noise;
        if (s > bestScore) {
            bestScore = s;
            best = token;
        }
    }
    return best;
}
