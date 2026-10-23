import { COLORS, type Color, type PlayerState } from './types';

export const TRACK_CELLS = 52;
export const LAST_TRACK_POS = 51;
export const HOME_POS = 57;

/** Absolute track cell (0..51) where each color enters the board. */
export const ENTRY: Record<Color, number> = { RED: 0, BLUE: 13, GREEN: 26, YELLOW: 39 };

/** Entry cells + star cells. No captures here. */
export const SAFE_CELLS: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Seat colors per player count — 2-player games sit in opposite corners. */
export function seatColors(maxPlayers: number): Color[] {
    if (maxPlayers === 2) return ['RED', 'GREEN'];
    if (maxPlayers === 3) return ['RED', 'BLUE', 'GREEN'];
    return [...COLORS];
}

/** Absolute track cell for a token position, or null when off the shared track. */
export function absCell(color: Color, pos: number): number | null {
    if (pos < 1 || pos > LAST_TRACK_POS) return null;
    return (ENTRY[color] + pos - 1) % TRACK_CELLS;
}

export function isSafeCell(cell: number): boolean {
    return SAFE_CELLS.has(cell);
}

/** Where a token lands with this dice value, or null if it cannot move. */
export function targetPos(from: number, dice: number): number | null {
    if (from === 0) return dice === 6 ? 1 : null;
    if (from >= HOME_POS) return null;
    const to = from + dice;
    return to <= HOME_POS ? to : null;
}

/** Positions visited one step at a time (for hop animations). */
export function stepPath(from: number, to: number): number[] {
    if (from === 0) return [1];
    const path: number[] = [];
    for (let p = from + 1; p <= to; p++) path.push(p);
    return path;
}

/** 0..1 — share of the total distance this player's tokens have covered. */
export function progress(player: PlayerState): number {
    let sum = 0;
    for (const t of player.tokens) sum += t;
    return sum / (HOME_POS * player.tokens.length);
}
