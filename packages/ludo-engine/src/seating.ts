import { seatColors } from './board';
import { COLORS, type Color } from './types';

/**
 * Color choice in a lobby. One set of rules for the server (authoritative) and
 * the app (what to show as free / taken):
 *   - Every seated player always holds exactly one color; no two share one.
 *   - Picking a free color releases the old one; leaving releases it too.
 *   - 2-player games stay in opposite corners: when one player switches to the
 *     other pair, the other player moves to the opposite of the new color.
 */

export const OPPOSITE: Record<Color, Color> = { RED: 'GREEN', GREEN: 'RED', BLUE: 'YELLOW', YELLOW: 'BLUE' };

export function isColor(value: unknown): value is Color {
    return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

export interface ColorSeat {
    id: string;
    color: Color;
}

export interface ColorChange {
    id: string;
    from: Color;
    to: Color;
}

/** Color for a player joining `seats`: the opposite corner in 2-player games, else the first free one. */
export function nextColor(maxPlayers: number, seats: ColorSeat[]): Color | null {
    const taken = new Set(seats.map(s => s.color));
    if (maxPlayers === 2 && seats.length === 1) {
        const opposite = OPPOSITE[seats[0]!.color];
        return taken.has(opposite) ? null : opposite;
    }
    const preferred = [...seatColors(maxPlayers), ...COLORS];
    return preferred.find(c => !taken.has(c)) ?? null;
}

/**
 * What happens when seat `id` picks `color`: the color changes to apply, in an
 * order that never puts two seats on one color in between, or null when the
 * color is held by someone else. An empty list means nothing changes.
 */
export function pickColor(maxPlayers: number, seats: ColorSeat[], id: string, color: Color): ColorChange[] | null {
    const me = seats.find(s => s.id === id);
    if (!me) return null;
    if (me.color === color) return [];
    if (seats.some(s => s.id !== id && s.color === color)) return null;

    const changes: ColorChange[] = [{ id, from: me.color, to: color }];
    if (maxPlayers === 2) {
        const other = seats.find(s => s.id !== id);
        if (other && other.color !== OPPOSITE[color]) {
            changes.push({ id: other.id, from: other.color, to: OPPOSITE[color] });
        }
    }
    // Whoever moves into a color another changing seat is leaving goes after it.
    return changes.sort((a, b) => (a.to === b.from ? 1 : b.to === a.from ? -1 : 0));
}

/** Applies changes to a seat list (returns a new list). */
export function applyColorChanges<T extends ColorSeat>(seats: T[], changes: ColorChange[]): T[] {
    return seats.map(s => {
        const c = changes.find(x => x.id === s.id);
        return c ? { ...s, color: c.to } : s;
    });
}
