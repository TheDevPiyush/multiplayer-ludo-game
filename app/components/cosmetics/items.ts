/**
 * The art behind each shop item id (the server's shop/catalog.ts has names and prices).
 * The shop lists only ids this app can draw, so items added on the server later wait for an
 * app update instead of showing blank. Unknown or missing ids draw as the default.
 */

import type { MotifKind } from './motifs';

export type ItemKind = 'pawn' | 'dice' | 'board';

// ─── Pawns ───────────────────────────────────────────────────────────────────

export type PawnStyle =
    | 'classic' | 'marble' | 'star' | 'crown' | 'gem'
    | 'robot' | 'ghost' | 'rocket' | 'cat' | 'knight' | 'ninja' | 'cupcake' | 'penguin'
    | 'diya' | 'alien' | 'trophy' | 'mushroom' | 'duck' | 'pumpkin' | 'planet';

const PAWNS: Record<string, PawnStyle> = {
    'pawn.classic': 'classic',
    'pawn.marble': 'marble',
    'pawn.star': 'star',
    'pawn.crown': 'crown',
    'pawn.gem': 'gem',
    'pawn.robot': 'robot',
    'pawn.ghost': 'ghost',
    'pawn.rocket': 'rocket',
    'pawn.cat': 'cat',
    'pawn.knight': 'knight',
    'pawn.ninja': 'ninja',
    'pawn.cupcake': 'cupcake',
    'pawn.penguin': 'penguin',
    'pawn.diya': 'diya',
    'pawn.alien': 'alien',
    'pawn.trophy': 'trophy',
    'pawn.mushroom': 'mushroom',
    'pawn.duck': 'duck',
    'pawn.pumpkin': 'pumpkin',
    'pawn.planet': 'planet',
};

export function pawnStyleOf(id: string | null | undefined): PawnStyle {
    return (id && PAWNS[id]) || 'classic';
}

// ─── Dice ────────────────────────────────────────────────────────────────────

export type DiceSkin = {
    /** Rim around the faces. */
    body: string;
    /** Face fill, top-left to bottom-right. */
    face: [string, string];
    /** Darkening of faces turned away from the light. */
    shade: string;
    /** Pip colour; null uses the roller's colour. */
    pip: string | null;
    /** Thin grain lines across each face. */
    grain?: string;
};

const DICE: Record<string, DiceSkin> = {
    'dice.classic': { body: '#A9AFC4', face: ['#FFFFFF', '#FFFFFF'], shade: '#1E2340', pip: null },
    'dice.midnight': { body: '#070B26', face: ['#2A3470', '#141B4A'], shade: '#000000', pip: '#FFD34D' },
    'dice.candy': { body: '#E9659F', face: ['#FFF0F6', '#FFC9DF'], shade: '#5A1035', pip: '#D81B72' },
    'dice.wood': { body: '#6B3A16', face: ['#E3AE74', '#C98A4B'], shade: '#2B1405', pip: '#3B1F0B', grain: 'rgba(90,45,10,0.28)' },
    'dice.gold': { body: '#A86F00', face: ['#FFE68A', '#F2B92E'], shade: '#3D2600', pip: null },
};

export function diceSkinOf(id: string | null | undefined): DiceSkin {
    return (id && DICE[id]) || DICE['dice.classic']!;
}

// ─── Boards ──────────────────────────────────────────────────────────────────

/** A colour, or one of the home's player shades (resolved per corner). */
export type ThemeColor = string | 'player' | 'playerBright' | 'playerDark' | 'playerTint';

/** Decoration over each home corner, drawn in that corner's own frame (outer corner at 0,0). */
export type HomeLayer =
    | { kind: 'motifs'; motif: MotifKind; color: ThemeColor; colors?: string[]; accent?: string; size: number; opacity?: number; spin?: boolean; spots?: 'all' | 'edges' | 'corners' }
    | { kind: 'web' | 'circuit' | 'waves' | 'grid' | 'grain' | 'stripes' | 'bands' | 'dunes' | 'hatch' | 'checker' | 'rays' | 'glow' | 'dots'; color: ThemeColor; opacity?: number };

export type BoardTheme = {
    frame: [string, string];
    frameStroke: string;
    frameStrokeWidth: number;
    /** Little stars scattered on the frame. */
    sparkles?: string;
    /** Festive lights all round the frame, in these colours in turn. */
    frameLights?: string[];
    /** Under the tiles: shows in the gaps between them. */
    surface: string;
    /** Tiny stars across the surface. */
    surfaceStars?: string;
    track: string;
    /** Every other square (checkerboard). */
    trackAlt?: string;
    trackStroke: string;
    trackStrokeWidth: number;
    /** Space between squares and their corner radius, as fractions of a square (0.5 radius: round). */
    tileGap: number;
    tileRadius: number;
    /** Home stretch and start squares. */
    lane: 'gradient' | 'solid' | 'pastel' | 'outline';
    /** How the four homes (and the finish triangles) are filled with their player's colour. */
    home: 'gradient' | 'solid' | 'pastel' | 'dark';
    /** The outer shade of `dark` homes. */
    homeDark?: string;
    layers: HomeLayer[];
    /** The panel the four token slots sit on (null: none, the home shows through). */
    panel: string | null;
    panelStroke?: ThemeColor;
    panelStrokeWidth?: number;
    /** Corner radius in squares; 2.2 makes it a circle. */
    panelRadius: number;
    panelShadow: boolean;
    /** A motif in the middle of each panel, between the slots. */
    panelMotif?: { motif: MotifKind; color: ThemeColor; accent?: string; size: number; opacity?: number };
    slots: 'tint' | 'dark' | 'ring' | 'hex' | 'square' | 'glow';
    /** Safe-square marker and the centre emblem (sizes in squares, centre to edge). */
    marker: { motif: MotifKind; color: string; accent?: string; size: number };
    center: { motif: MotifKind; color: string; accent?: string; size: number; opacity?: number };
    centerLines: string;
};

const BASE: Omit<BoardTheme, 'frame' | 'marker' | 'center'> = {
    frameStroke: 'rgba(255,255,255,0.18)', frameStrokeWidth: 1.5,
    surface: '#FFFFFF', track: '#FFFFFF', trackStroke: '#D6DAE8', trackStrokeWidth: 1, tileGap: 0, tileRadius: 0,
    lane: 'gradient', home: 'gradient', layers: [],
    panel: '#FFFFFF', panelRadius: 0.7, panelShadow: true, slots: 'tint',
    centerLines: 'rgba(255,255,255,0.7)',
};

const theme = (t: Partial<BoardTheme> & Pick<BoardTheme, 'frame' | 'marker' | 'center'>): BoardTheme => ({ ...BASE, ...t });

const BOARDS: Record<string, BoardTheme> = {
    'board.classic': theme({
        frame: ['#2B2499', '#140F5C'],
        marker: { motif: 'star', color: '#C3C9DD', size: 0.36 },
        center: { motif: 'star', color: '#FFFFFF', size: 0.42, opacity: 0.9 },
    }),
    'board.midnight': theme({
        frame: ['#141B52', '#03061A'], frameStroke: 'rgba(150,170,255,0.35)', sparkles: '#FFFFFF',
        surface: '#11173F', surfaceStars: '#FFFFFF', track: '#232B66', trackStroke: '#3B4488', tileGap: 0.06, tileRadius: 0.14,
        home: 'dark', homeDark: '#0B1030',
        layers: [{ kind: 'motifs', motif: 'sparkle', color: '#FFFFFF', size: 0.13, opacity: 0.75 }],
        panel: '#161D4C', panelStroke: 'player', panelStrokeWidth: 1.5, panelShadow: false, slots: 'dark',
        panelMotif: { motif: 'moon', color: '#FFE9A8', size: 0.42, opacity: 0.9 },
        marker: { motif: 'star', color: '#FFD34D', size: 0.36 },
        center: { motif: 'moon', color: '#FFE9A8', size: 0.48 },
        centerLines: 'rgba(255,255,255,0.35)',
    }),
    'board.garden': theme({
        frame: ['#3E9142', '#155A1C'], frameStroke: 'rgba(220,255,200,0.35)',
        surface: '#FFF7E3', track: '#FFFCF2', trackStroke: '#DCCDA2', tileGap: 0.05, tileRadius: 0.18,
        layers: [{ kind: 'motifs', motif: 'leaf', color: '#FFFFFF', accent: 'rgba(0,0,0,0.15)', size: 0.26, opacity: 0.45 }],
        panel: '#FFFCF2', panelRadius: 0.9, slots: 'ring',
        panelMotif: { motif: 'flower', color: 'player', accent: '#FFD34D', size: 0.4 },
        marker: { motif: 'blossom', color: '#86C25A', accent: '#FFFFFF', size: 0.38 },
        center: { motif: 'flower', color: '#FFFFFF', accent: '#FFD34D', size: 0.5 },
    }),
    'board.royal': theme({
        frame: ['#5A1A9E', '#220A4D'], frameStroke: '#E8B931', frameStrokeWidth: 3, sparkles: '#F5D36B',
        surface: '#FFFDF6', trackStroke: '#E6D8B0',
        layers: [{ kind: 'rays', color: 'rgba(255,230,150,0.35)' }, { kind: 'motifs', motif: 'crown', color: '#F5D36B', accent: '#C99A1E', size: 0.22, spots: 'edges' }],
        panel: '#FFFDF6', panelStroke: '#E8B931', panelStrokeWidth: 1.5, panelRadius: 0.5, slots: 'ring',
        marker: { motif: 'crown', color: '#E8B931', accent: '#C99A1E', size: 0.36 },
        center: { motif: 'crown', color: '#F5D36B', accent: '#FFFFFF', size: 0.5 },
    }),

    'board.haunted': theme({
        frame: ['#2A0E3D', '#0A0410'], frameStroke: '#FF8A1E', frameStrokeWidth: 2,
        surface: '#140A1E', track: '#24143A', trackAlt: '#2B1846', trackStroke: '#3E2858', tileGap: 0.07, tileRadius: 0.16,
        home: 'dark', homeDark: '#0E0616',
        layers: [{ kind: 'web', color: 'rgba(255,255,255,0.4)' }, { kind: 'motifs', motif: 'bat', color: 'playerBright', size: 0.4, opacity: 0.6, spots: 'edges' }],
        panel: '#1A0E28', panelStroke: 'player', panelStrokeWidth: 1.5, panelRadius: 0.5, panelShadow: false, slots: 'dark',
        panelMotif: { motif: 'pumpkin', color: '#FF8A1E', accent: '#2A1200', size: 0.48 },
        marker: { motif: 'pumpkin', color: '#FF8A1E', accent: '#3A1600', size: 0.38 },
        center: { motif: 'ghost', color: '#F4ECFF', accent: '#1A0E28', size: 0.5 },
        centerLines: 'rgba(255,255,255,0.25)',
    }),
    'board.diwali': theme({
        frame: ['#8E1B2E', '#4A0814'], frameStroke: '#F5C542', frameStrokeWidth: 2.5, frameLights: ['#FFD34D', '#FF8A3D', '#FFF1A8'],
        surface: '#FFF0D6', track: '#FFFBF0', trackStroke: '#EBC98A', tileGap: 0.05, tileRadius: 0.2,
        layers: [{ kind: 'dots', color: 'rgba(255,240,190,0.55)' }, { kind: 'motifs', motif: 'diya', color: '#C2571A', accent: '#7A2E0A', size: 0.3, spots: 'corners' }],
        panel: '#FFF8EA', panelStroke: '#F5C542', panelStrokeWidth: 2, panelRadius: 2.2, slots: 'ring',
        panelMotif: { motif: 'rangoli', color: 'player', accent: '#F5C542', size: 0.58 },
        marker: { motif: 'diya', color: '#C2571A', accent: '#7A2E0A', size: 0.4 },
        center: { motif: 'rangoli', color: '#F5C542', accent: '#FF6A3D', size: 0.56 },
        centerLines: 'rgba(255,255,255,0.6)',
    }),
    'board.mech': theme({
        frame: ['#5B6675', '#232A33'], frameStroke: '#3FE0FF', frameStrokeWidth: 1.5,
        surface: '#11151B', track: '#262E39', trackStroke: '#3A4656', tileGap: 0.07, tileRadius: 0.08,
        lane: 'outline', home: 'dark', homeDark: '#12161C',
        layers: [{ kind: 'circuit', color: 'rgba(63,224,255,0.6)' }],
        panel: '#1E252E', panelStroke: 'player', panelStrokeWidth: 2, panelRadius: 0.25, panelShadow: false, slots: 'hex',
        panelMotif: { motif: 'gear', color: 'player', accent: '#1E252E', size: 0.48 },
        marker: { motif: 'gear', color: '#3FE0FF', accent: '#262E39', size: 0.36 },
        center: { motif: 'reactor', color: '#3FE0FF', accent: '#0E1218', size: 0.58 },
        centerLines: 'rgba(63,224,255,0.4)',
    }),
    'board.space': theme({
        frame: ['#2A0B5E', '#05010F'], frameStroke: 'rgba(200,160,255,0.4)', sparkles: '#FFFFFF',
        surface: '#0A0620', surfaceStars: '#FFFFFF', track: '#1A1342', trackStroke: '#3A2E7A', tileGap: 0.1, tileRadius: 0.5,
        home: 'dark', homeDark: '#06021A',
        layers: [{ kind: 'glow', color: 'playerBright' }, { kind: 'motifs', motif: 'sparkle', color: '#FFFFFF', size: 0.12, opacity: 0.85 }],
        panel: null, panelRadius: 0, panelShadow: false, slots: 'glow',
        panelMotif: { motif: 'planet', color: 'playerBright', accent: '#FFFFFF', size: 0.55 },
        marker: { motif: 'planet', color: '#B28CFF', accent: '#FFFFFF', size: 0.4 },
        center: { motif: 'rocket', color: '#E8E4FF', accent: '#B28CFF', size: 0.55 },
        centerLines: 'rgba(255,255,255,0.25)',
    }),
    'board.reef': theme({
        frame: ['#1BA3B8', '#0B4F7A'], frameStroke: 'rgba(255,255,255,0.4)',
        surface: '#D3F0F5', track: '#F4FDFF', trackAlt: '#E6F8FB', trackStroke: '#A8DDE6', tileGap: 0.05, tileRadius: 0.22,
        layers: [{ kind: 'waves', color: 'rgba(255,255,255,0.5)' }, { kind: 'motifs', motif: 'bubble', color: '#FFFFFF', size: 0.16, opacity: 0.85 }],
        panel: '#F2FCFF', panelRadius: 1, slots: 'ring',
        panelMotif: { motif: 'shell', color: 'playerBright', accent: 'playerDark', size: 0.44 },
        marker: { motif: 'shell', color: '#FF8C7A', accent: '#C9503F', size: 0.38 },
        center: { motif: 'star', color: '#FF8C5A', size: 0.5 },
    }),
    'board.snow': theme({
        frame: ['#A9DBF7', '#3E7DC0'], frameStroke: '#FFFFFF', frameStrokeWidth: 2, sparkles: '#FFFFFF',
        surface: '#E6F1FB', track: '#FFFFFF', trackStroke: '#CFE2F3', tileGap: 0.05, tileRadius: 0.25,
        home: 'pastel',
        layers: [{ kind: 'motifs', motif: 'snowflake', color: '#FFFFFF', size: 0.27, opacity: 0.95, spin: true }],
        panel: '#FFFFFF', panelStroke: 'player', panelStrokeWidth: 1.5, panelRadius: 0.9, panelShadow: false, slots: 'ring',
        panelMotif: { motif: 'snowflake', color: 'player', size: 0.44 },
        marker: { motif: 'snowflake', color: '#6FB3E8', size: 0.38 },
        center: { motif: 'snowflake', color: '#FFFFFF', size: 0.56 },
        centerLines: 'rgba(255,255,255,0.8)',
    }),
    'board.candy': theme({
        frame: ['#FF8FC4', '#B44BD8'], frameStroke: '#FFFFFF', frameStrokeWidth: 2.5,
        surface: '#FFE2F1', track: '#FFFFFF', trackAlt: '#FFE6F3', trackStroke: '#F7BFD9', tileGap: 0.05, tileRadius: 0.3,
        home: 'pastel',
        layers: [
            { kind: 'stripes', color: 'rgba(255,255,255,0.35)' },
            { kind: 'motifs', motif: 'sprinkle', color: '#FFFFFF', colors: ['#FF5FA2', '#5FD3FF', '#FFD34D', '#7CE38B', '#FFFFFF'], size: 0.2, spin: true },
        ],
        panel: '#FFFFFF', panelRadius: 1.2, slots: 'tint',
        panelMotif: { motif: 'lollipop', color: 'player', accent: '#FFFFFF', size: 0.44 },
        marker: { motif: 'heart', color: '#FF5FA2', size: 0.36 },
        center: { motif: 'lollipop', color: '#FF5FA2', accent: '#FFFFFF', size: 0.56 },
    }),
    'board.desert': theme({
        frame: ['#E0A85C', '#8A5520'], frameStroke: 'rgba(255,240,210,0.5)',
        surface: '#EBCB97', track: '#FBEFD6', trackStroke: '#D9B988', tileGap: 0.05, tileRadius: 0.12,
        layers: [{ kind: 'dunes', color: 'rgba(255,236,200,0.8)' }, { kind: 'motifs', motif: 'cactus', color: '#2F7D4A', size: 0.3, spots: 'corners' }],
        panel: '#FBEBCB', slots: 'tint',
        panelMotif: { motif: 'sun', color: 'playerBright', accent: '#FFFFFF', size: 0.44 },
        marker: { motif: 'sun', color: '#E88A1A', accent: '#FFE27A', size: 0.38 },
        center: { motif: 'sun', color: '#FFB020', accent: '#FFF3B0', size: 0.56 },
    }),
    'board.sakura': theme({
        frame: ['#F6C1D6', '#B8577F'], frameStroke: '#FFFFFF',
        surface: '#FDEAF1', track: '#FFFFFF', trackAlt: '#FFF0F6', trackStroke: '#F1CFDD', tileGap: 0.04, tileRadius: 0.5,
        home: 'pastel',
        layers: [{ kind: 'motifs', motif: 'blossom', color: '#FFFFFF', accent: '#F48FB1', size: 0.4, opacity: 0.95, spin: true }],
        panel: '#FFF7FA', panelStroke: 'player', panelStrokeWidth: 1.5, panelRadius: 2.2, panelShadow: false, slots: 'ring',
        panelMotif: { motif: 'blossom', color: 'player', accent: '#FFFFFF', size: 0.44 },
        marker: { motif: 'blossom', color: '#F48FB1', accent: '#FFFFFF', size: 0.38 },
        center: { motif: 'blossom', color: '#FFFFFF', accent: '#F48FB1', size: 0.56 },
    }),
    'board.neon': theme({
        frame: ['#141414', '#000000'], frameStroke: '#FF3DF2', frameStrokeWidth: 2,
        surface: '#05050A', track: '#0E0E18', trackStroke: '#2A2A48', tileGap: 0.08, tileRadius: 0.18,
        lane: 'outline', home: 'dark', homeDark: '#05050A',
        layers: [{ kind: 'grid', color: 'player', opacity: 0.55 }],
        panel: '#0B0B14', panelStroke: 'player', panelStrokeWidth: 2, panelRadius: 0.4, panelShadow: false, slots: 'glow',
        panelMotif: { motif: 'bolt', color: 'player', size: 0.44 },
        marker: { motif: 'bolt', color: '#3DF5FF', size: 0.36 },
        center: { motif: 'ring', color: '#FF3DF2', size: 0.55 },
        centerLines: '#3DF5FF',
    }),
    'board.wood': theme({
        frame: ['#7A4520', '#3B1E0A'], frameStroke: 'rgba(255,220,170,0.3)',
        surface: '#B9844C', track: '#EED1A4', trackAlt: '#E6C391', trackStroke: '#B07E48', tileGap: 0.05, tileRadius: 0.1,
        lane: 'solid', home: 'dark', homeDark: '#2A1405',
        layers: [{ kind: 'grain', color: 'rgba(0,0,0,0.22)' }],
        panel: '#F2D8AE', panelStroke: '#8A5A2B', panelStrokeWidth: 1.5, panelRadius: 0.5, slots: 'tint',
        marker: { motif: 'star', color: '#9A6A38', size: 0.36 },
        center: { motif: 'compass', color: '#F2D8AE', accent: '#FFE2B0', size: 0.52 },
        centerLines: 'rgba(255,235,200,0.6)',
    }),
    'board.chalk': theme({
        frame: ['#8A5A2B', '#5A3618'], frameStroke: 'rgba(255,255,255,0.3)',
        surface: '#22382C', track: '#2A4535', trackStroke: 'rgba(255,255,255,0.55)', trackStrokeWidth: 1.2,
        lane: 'outline', home: 'dark', homeDark: '#22382C',
        layers: [{ kind: 'hatch', color: 'playerBright', opacity: 0.85 }],
        panel: '#22382C', panelStroke: 'rgba(255,255,255,0.75)', panelStrokeWidth: 1.5, panelRadius: 0.3, panelShadow: false, slots: 'ring',
        panelMotif: { motif: 'chalkStar', color: 'playerBright', size: 0.44 },
        marker: { motif: 'chalkStar', color: '#FFFFFF', size: 0.38 },
        center: { motif: 'chalkStar', color: '#FFFFFF', size: 0.56 },
        centerLines: 'rgba(255,255,255,0.6)',
    }),
    'board.pixel': theme({
        frame: ['#202020', '#000000'], frameStroke: '#FFFFFF', frameStrokeWidth: 2,
        surface: '#000000', track: '#F2F2F2', trackAlt: '#D6D6E2', trackStroke: '#000000',
        lane: 'solid', home: 'solid',
        layers: [{ kind: 'checker', color: 'rgba(0,0,0,0.25)' }],
        panel: '#111111', panelRadius: 0, panelShadow: false, slots: 'square',
        panelMotif: { motif: 'pixelHeart', color: 'player', size: 0.46 },
        marker: { motif: 'pixelStar', color: '#FFC21A', size: 0.38 },
        center: { motif: 'pixelStar', color: '#FFFFFF', size: 0.56 },
        centerLines: '#000000',
    }),
    'board.holi': theme({
        frame: ['#FF6EC7', '#7B5CFF'], frameStroke: '#FFFFFF', frameStrokeWidth: 2, frameLights: ['#FFD34D', '#3DDC97', '#3DB8FF', '#FF6E6E'],
        surface: '#F6F0FF', track: '#FFFFFF', trackStroke: '#E8E2F2', tileGap: 0.04, tileRadius: 0.16,
        layers: [{ kind: 'motifs', motif: 'splash', color: '#FFFFFF', colors: ['#FFD34D', '#3DDC97', '#3DB8FF', '#FF6EC7', '#B28CFF'], size: 0.36, opacity: 0.95, spin: true }],
        panel: '#FFFFFF', panelRadius: 2.2, slots: 'tint',
        panelMotif: { motif: 'splash', color: 'player', size: 0.55, opacity: 0.35 },
        marker: { motif: 'splash', color: '#FF6EC7', size: 0.36 },
        center: { motif: 'burst', color: '#FFD34D', accent: '#FF6EC7', size: 0.58 },
    }),
    'board.stadium': theme({
        frame: ['#2E7D32', '#14451A'], frameStroke: '#FFFFFF', frameStrokeWidth: 2,
        surface: '#3F9142', track: '#ECE0B8', trackAlt: '#E3D4A6', trackStroke: '#BFAE7A', tileGap: 0.05, tileRadius: 0.08,
        layers: [{ kind: 'bands', color: 'rgba(255,255,255,0.13)' }],
        panel: '#4CA650', panelStroke: '#FFFFFF', panelStrokeWidth: 1.5, panelRadius: 2.2, panelShadow: false, slots: 'ring',
        panelMotif: { motif: 'stumps', color: '#F2E6C4', accent: '#F5C542', size: 0.4 },
        marker: { motif: 'ball', color: '#C8102E', accent: '#FFFFFF', size: 0.36 },
        center: { motif: 'ball', color: '#C8102E', accent: '#FFFFFF', size: 0.5 },
        centerLines: 'rgba(255,255,255,0.6)',
    }),
};

export function boardThemeOf(id: string | null | undefined): BoardTheme {
    return (id && BOARDS[id]) || BOARDS['board.classic']!;
}

/** Every item this app can draw. */
export function itemIds(): string[] {
    return [...Object.keys(PAWNS), ...Object.keys(DICE), ...Object.keys(BOARDS)];
}

/** Whether this app can draw an item. */
export function canDraw(id: string): boolean {
    return id in PAWNS || id in DICE || id in BOARDS;
}
