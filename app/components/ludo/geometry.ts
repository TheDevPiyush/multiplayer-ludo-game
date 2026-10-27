import { Dimensions } from 'react-native';

/** Board geometry shared by the online and local game screens. */
const { width: W } = Dimensions.get('window');

export const BOARD_SIZE = Math.min(W - 16, 460);
export const BOARD_PAD = 8;
export const CELL = (BOARD_SIZE - BOARD_PAD * 2) / 15;

/** Vivid player colours (board, tokens, dice pips, UI accents). */
export const COLOR_HEX: Record<string, string> = {
    RED: '#FF3B4E',
    BLUE: '#2E86FF',
    GREEN: '#14C46B',
    YELLOW: '#FFC21A',
};

export const COLOR_BRIGHT: Record<string, string> = {
    RED: '#FF8A94',
    BLUE: '#8CC2FF',
    GREEN: '#6FF0A8',
    YELLOW: '#FFE27A',
};

export const COLOR_DARK: Record<string, string> = {
    RED: '#B0122A',
    BLUE: '#1450C8',
    GREEN: '#07824A',
    YELLOW: '#D08A00',
};

/** Very light tint of each colour for home-base panels. */
export const COLOR_TINT: Record<string, string> = {
    RED: '#FFE3E6',
    BLUE: '#E0EDFF',
    GREEN: '#DDF8EA',
    YELLOW: '#FFF4D1',
};

/** Duration of one cell-to-cell token hop. Drivers wait `steps * HOP_MS` after a move. */
export const HOP_MS = 135;
/** A captured token waits for the attacker to land, then slides home for this long. */
export const CAPTURE_RETURN_DELAY_MS = 520;
export const CAPTURE_RETURN_MS = 420;

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
/** Four token slots per home base, centred on the base's 6×6 square (centre = corner + 3). */
export const HOME_TOKEN_SLOTS: Record<string, [number, number][]> = {
    RED:    [[2, 2], [4, 2], [2, 4], [4, 4]],
    BLUE:   [[11, 2], [13, 2], [11, 4], [13, 4]],
    GREEN:  [[11, 11], [13, 11], [11, 13], [13, 13]],
    YELLOW: [[2, 11], [4, 11], [2, 13], [4, 13]],
};

// ─────────────────────────────────────────────────────────────
// TURNING THE BOARD (each player sees their own home bottom-right)
// ─────────────────────────────────────────────────────────────

/** Board corners, clockwise from top-left. */
const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;
export type Corner = (typeof CORNERS)[number];
/** Where each home sits on the unturned board (index into CORNERS). */
const HOME_CORNER: Record<string, number> = { RED: 0, BLUE: 1, GREEN: 2, YELLOW: 3 };

/** Clockwise quarter turns that bring `color`'s home to the bottom-right (0 for no color). */
export function turnsFor(color: string | null | undefined): number {
    const at = color ? HOME_CORNER[color] : undefined;
    return at === undefined ? 0 : (2 - at + 4) % 4;
}

/** Where `color`'s home is once the board is turned. */
export function cornerOf(color: string, turns: number): Corner {
    return CORNERS[((HOME_CORNER[color] ?? 0) + turns) % 4]!;
}

/** A board pixel position after `turns` clockwise quarter turns about the board's centre. */
export function turnPoint(p: { x: number; y: number }, turns: number): { x: number; y: number } {
    let { x, y } = p;
    for (let i = 0; i < turns % 4; i++) [x, y] = [BOARD_SIZE - y, x];
    return { x, y };
}

/** Players for the strips above ([top-left, top-right]) and below ([bottom-left, bottom-right]) the board. */
export function stripRows<T extends { color: string }>(items: T[], turns: number): [(T | null)[], (T | null)[]] {
    const at = (corner: Corner) => items.find(i => cornerOf(i.color, turns) === corner) ?? null;
    return [[at('tl'), at('tr')], [at('bl'), at('br')]];
}

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

/** Pixel position of every token (on a board turned `turns` quarter turns); tokens sharing a square are fanned out. */
export function layoutTokens(players: BoardPlayer[], turns = 0): TokenLayout[] {
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
    return base.map(({ cellKey: _, ...t }) => ({ ...t, coord: turnPoint(t.coord, turns) }));
}
