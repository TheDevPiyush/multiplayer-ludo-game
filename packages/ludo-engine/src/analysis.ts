import { absCell, HOME_POS, isSafeCell, LAST_TRACK_POS, progress, TRACK_CELLS, targetPos } from './board';
import type { Color, GameState, PlayerState } from './types';

export function getPlayer(state: GameState, color: Color): PlayerState | undefined {
    return state.players.find(p => p.color === color);
}

/** Players still racing (in the game and not finished). */
export function racingPlayers(state: GameState): PlayerState[] {
    return state.players.filter(p => p.active && p.rank === null);
}

/** Token indices the player may move with `dice`. */
export function movableTokens(player: PlayerState, dice: number): number[] {
    const out: number[] = [];
    player.tokens.forEach((pos, i) => {
        if (targetPos(pos, dice) !== null) out.push(i);
    });
    return out;
}

/** Legal moves for the current turn. Empty when the turn must be passed. */
export function legalMoves(state: GameState): number[] {
    if (state.phase !== 'MOVE' || state.dice === null) return [];
    if (state.rules.threeSixesForfeit && state.sixStreak >= 3) return [];
    const player = getPlayer(state, state.turn);
    if (!player) return [];
    return movableTokens(player, state.dice);
}

/** Legal moves with duplicates removed (tokens on the same square are equivalent). */
export function distinctMoves(state: GameState): number[] {
    const player = getPlayer(state, state.turn);
    if (!player) return [];
    const seen = new Set<number>();
    return legalMoves(state).filter(i => {
        const pos = player.tokens[i]!;
        if (seen.has(pos)) return false;
        seen.add(pos);
        return true;
    });
}

/** Opponent tokens sitting on an absolute track cell. */
export function tokensOnCell(state: GameState, cell: number, except: Color): { color: Color; token: number }[] {
    const out: { color: Color; token: number }[] = [];
    for (const p of state.players) {
        if (p.color === except || !p.active) continue;
        p.tokens.forEach((pos, token) => {
            if (absCell(p.color, pos) === cell) out.push({ color: p.color, token });
        });
    }
    return out;
}

/** True if an opponent could land on this cell with a single roll. */
export function isCellThreatened(state: GameState, cell: number, owner: Color): boolean {
    if (isSafeCell(cell)) return false;
    for (const p of state.players) {
        if (p.color === owner || !p.active || p.rank !== null) continue;
        for (const pos of p.tokens) {
            const from = absCell(p.color, pos);
            if (from === null) continue;
            const dist = (cell - from + TRACK_CELLS) % TRACK_CELLS;
            // Opponent must stay on the shared track to reach the cell.
            if (dist >= 1 && dist <= 6 && pos + dist <= LAST_TRACK_POS) return true;
        }
    }
    return false;
}

export interface MoveOutcome {
    from: number;
    to: number;
    captures: { color: Color; token: number }[];
    reachesHome: boolean;
    leavesBase: boolean;
    landsSafe: boolean;
    /** Token was capturable before the move and is not after. */
    escapes: boolean;
    /** Token was safe before the move and is capturable after. */
    entersDanger: boolean;
}

export function evaluateMove(state: GameState, color: Color, token: number, dice: number): MoveOutcome | null {
    const player = getPlayer(state, color);
    const from = player?.tokens[token];
    if (from === undefined) return null;
    const to = targetPos(from, dice);
    if (to === null) return null;

    const fromCell = absCell(color, from);
    const toCell = absCell(color, to);
    const captures = toCell !== null && !isSafeCell(toCell) ? tokensOnCell(state, toCell, color) : [];
    const wasThreatened = fromCell !== null && isCellThreatened(state, fromCell, color);
    const nowThreatened = toCell !== null && captures.length === 0 && isCellThreatened(state, toCell, color);

    return {
        from,
        to,
        captures,
        reachesHome: to === HOME_POS,
        leavesBase: from === 0,
        landsSafe: toCell === null || isSafeCell(toCell),
        escapes: wasThreatened && !nowThreatened,
        entersDanger: !wasThreatened && nowThreatened,
    };
}

/** Color of the racing player furthest ahead. */
export function leaderOf(state: GameState): Color | null {
    let best: PlayerState | null = null;
    for (const p of racingPlayers(state)) {
        if (!best || progress(p) > progress(best)) best = p;
    }
    return best?.color ?? null;
}
