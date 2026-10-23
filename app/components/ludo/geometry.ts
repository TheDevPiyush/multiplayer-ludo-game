import { Dimensions } from 'react-native';

/** Board geometry shared by the online and local game screens. */
const { width: W } = Dimensions.get('window');

export const BOARD_SIZE = Math.min(W - 16, 460);
export const BOARD_PAD = 7;
export const CELL = (BOARD_SIZE - BOARD_PAD * 2) / 15;

export const COLOR_HEX: Record<string, string> = {
    RED: '#E04848',
    BLUE: '#4488E8',
    GREEN: '#37BD6A',
    YELLOW: '#F0B530',
};

export const COLOR_BRIGHT: Record<string, string> = {
    RED: '#FF7B6E',
    BLUE: '#7FB1FF',
    GREEN: '#6FE39A',
    YELLOW: '#FFD76A',
};

export const COLOR_DARK: Record<string, string> = {
    RED: '#9A2828',
    BLUE: '#2A5BAA',
    GREEN: '#1F7A41',
    YELLOW: '#A87510',
};

export const SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];

// ─────────────────────────────────────────────────────────────
// BOARD PATH (52 cells, clockwise starting from RED entry)
// ─────────────────────────────────────────────────────────────

export const LUDO_PATH: [number, number][] = [
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    [7, 0], [8, 0],
    [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    [14, 7], [14, 8],
    [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    [7, 14], [6, 14],
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    [0, 7], [0, 6],
];

export const COLOR_ENTRY: Record<string, number> = {
    RED: 0, BLUE: 13, GREEN: 26, YELLOW: 39,
};

export const HOME_STRETCH: Record<string, [number, number][]> = {
    RED:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    BLUE:   [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    GREEN:  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    YELLOW: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

export const CENTER: [number, number] = [7, 7];

export const HOME_BASE_BOX: Record<string, [number, number]> = {
    RED:    [0, 0],
    BLUE:   [9, 0],
    GREEN:  [9, 9],
    YELLOW: [0, 9],
};

// Four token slots inside each home base (in cell coords, board-relative)
export const HOME_TOKEN_SLOTS: Record<string, [number, number][]> = {
    RED:    [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]].map(p => [p[0], p[1]] as [number, number]) as [number, number][],
    BLUE:   [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]] as [number, number][],
    GREEN:  [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]] as [number, number][],
    YELLOW: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]] as [number, number][],
};

export function posToCoord(pos: number, color: string): [number, number] {
    if (pos === 57) return CENTER;
    if (pos >= 52) return HOME_STRETCH[color]?.[pos - 52] ?? CENTER;
    const entry = COLOR_ENTRY[color] ?? 0;
    const index = (entry + pos - 1) % LUDO_PATH.length;
    return LUDO_PATH[index] ?? CENTER;
}

export function cellCenter(col: number, row: number) {
    return { x: BOARD_PAD + col * CELL + CELL / 2, y: BOARD_PAD + row * CELL + CELL / 2 };
}

// Detect token-stacks at same coord so we can spread them out a bit
export function getStackOffset(idxInStack: number, stackSize: number): { dx: number; dy: number } {
    if (stackSize <= 1) return { dx: 0, dy: 0 };
    const r = CELL * 0.16;
    const angle = (idxInStack / stackSize) * Math.PI * 2;
    return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

export type BoardPlayer = {
    color: string;
    tokens: number[];
    /** Stable owner id (user id online, seat id locally). */
    owner: string;
};

export type TokenLayout = {
    key: string;
    color: string;
    owner: string;
    tokenIndex: number;
    pos: number;
    coord: { x: number; y: number };
};

/** Pixel position of every token; tokens sharing a square are fanned out. */
export function layoutTokens(players: BoardPlayer[]): TokenLayout[] {
    const base: (TokenLayout & { cellKey: string | null })[] = [];
    for (const p of players) {
        p.tokens.forEach((pos, tokenIndex) => {
            let x: number;
            let y: number;
            let cellKey: string | null = null;
            if (pos === 0) {
                const slot = HOME_TOKEN_SLOTS[p.color]?.[tokenIndex];
                if (!slot) return;
                x = BOARD_PAD + slot[0] * CELL;
                y = BOARD_PAD + slot[1] * CELL;
            } else {
                const [c, r] = posToCoord(pos, p.color);
                ({ x, y } = cellCenter(c, r));
                cellKey = `${c}-${r}`;
            }
            base.push({ key: `${p.color}-${tokenIndex}`, color: p.color, owner: p.owner, tokenIndex, pos, coord: { x, y }, cellKey });
        });
    }

    const stacks = new Map<string, number[]>();
    base.forEach((t, i) => {
        if (!t.cellKey) return;
        const list = stacks.get(t.cellKey) ?? [];
        list.push(i);
        stacks.set(t.cellKey, list);
    });
    for (const list of stacks.values()) {
        list.forEach((i, idx) => {
            const off = getStackOffset(idx, list.length);
            const t = base[i]!;
            t.coord = { x: t.coord.x + off.dx, y: t.coord.y + off.dy };
        });
    }
    return base.map(({ cellKey: _, ...t }) => t);
}
