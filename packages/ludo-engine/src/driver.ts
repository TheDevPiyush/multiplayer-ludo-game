import { distinctMoves, legalMoves } from './analysis';
import type { Action, GameState } from './types';

/**
 * The move a driver (server, local game loop) should play without waiting for
 * the player: pass when nothing can move, auto-move when only one move exists.
 */
export function autoAction(state: GameState): Action | null {
    if (state.phase !== 'MOVE') return null;
    if (legalMoves(state).length === 0) return { type: 'PASS', color: state.turn };
    if (state.rules.autoMoveSingle) {
        const distinct = distinctMoves(state);
        if (distinct.length === 1) return { type: 'MOVE', color: state.turn, token: distinct[0]! };
    }
    return null;
}
