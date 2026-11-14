import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { boardThemeOf, type BoardTheme, type HomeLayer, type ThemeColor } from '@/components/cosmetics/items';
import { Motif } from '@/components/cosmetics/motifs';
import {
    BOARD_PAD,
    BOARD_SIZE,
    CELL,
    COLOR_BRIGHT,
    COLOR_DARK,
    COLOR_ENTRY,
    COLOR_HEX,
    COLOR_TINT,
    HOME_STRETCH,
    HOME_TOKEN_SLOTS,
    LUDO_PATH,
    SAFE_POSITIONS,
} from './geometry';

const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
type PlayerColor = (typeof COLORS)[number];
/** Each home, and the quarter turn that carries the top-left home's frame onto it. */
const QUADRANTS = [
    { c: 'RED' as const, bx: 0, by: 0, corner: 'tl' as const, angle: 0 },
    { c: 'BLUE' as const, bx: 9, by: 0, corner: 'tr' as const, angle: 90 },
    { c: 'GREEN' as const, bx: 9, by: 9, corner: 'br' as const, angle: 180 },
    { c: 'YELLOW' as const, bx: 0, by: 9, corner: 'bl' as const, angle: 270 },
];
const ENTRY_INDICES = new Set(Object.values(COLOR_ENTRY));
/** Corner radius of the board surface (and of the homes in its corners). */
const SURFACE_RADIUS = 12;

/** Quadrant rect with only its outer board corner rounded. */
function quadrantPath(x: number, y: number, s: number, corner: 'tl' | 'tr' | 'bl' | 'br', r: number): string {
    switch (corner) {
        case 'tl':
            return `M${x + r},${y} L${x + s},${y} L${x + s},${y + s} L${x},${y + s} L${x},${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
        case 'tr':
            return `M${x},${y} L${x + s - r},${y} A${r},${r} 0 0 1 ${x + s},${y + r} L${x + s},${y + s} L${x},${y + s} Z`;
        case 'br':
            return `M${x},${y} L${x + s},${y} L${x + s},${y + s - r} A${r},${r} 0 0 1 ${x + s - r},${y + s} L${x},${y + s} Z`;
        case 'bl':
            return `M${x},${y} L${x + s},${y} L${x + s},${y + s} L${x + r},${y + s} A${r},${r} 0 0 1 ${x},${y + s - r} Z`;
    }
}

function isTrackCell(c: number, r: number): boolean {
    const inCorner = (c < 6 || c > 8) && (r < 6 || r > 8);
    const inCenter = c >= 6 && c <= 8 && r >= 6 && r <= 8;
    return !inCorner && !inCenter;
}

function shade(color: ThemeColor, player: PlayerColor): string {
    switch (color) {
        case 'player': return COLOR_HEX[player]!;
        case 'playerBright': return COLOR_BRIGHT[player]!;
        case 'playerDark': return COLOR_DARK[player]!;
        case 'playerTint': return COLOR_TINT[player]!;
        default: return color;
    }
}

/** Fixed pseudo-random points (0–1), so scattered stars never move between renders. */
function scatter(n: number, seed: number): [number, number][] {
    let s = seed;
    const next = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: n }, () => [next(), next()] as [number, number]);
}
const STARS = scatter(70, 7);

const C = CELL;
const Q = 6 * C;
/** Middle of the band between a home's edge and its panel. */
const BAND = 0.4 * C;
const EDGE_SPOTS: [number, number][] = [1.5, 3, 4.5].flatMap(t => [
    [t * C, BAND], [t * C, Q - BAND], [BAND, t * C], [Q - BAND, t * C],
] as [number, number][]);
const CORNER_SPOTS: [number, number][] = [[BAND, BAND], [Q - BAND, BAND], [BAND, Q - BAND], [Q - BAND, Q - BAND]];

/** The same drawing along each of a home's four edges (drawn for the top edge, turned for the others). */
function FourSides({ children }: { children: React.ReactNode }) {
    return (
        <>
            {[0, 90, 180, 270].map(a => (
                <G key={a} transform={`rotate(${a} ${Q / 2} ${Q / 2})`}>{children}</G>
            ))}
        </>
    );
}

const wave = (y: number) => `M${0.3 * C},${y} q${0.35 * C},${-0.2 * C} ${0.7 * C},0` + ` t${0.7 * C},0`.repeat(6);

/** One decoration layer over a home, in that home's frame (outer corner at 0,0). `upright` undoes the turns. */
function Layer({ layer, player, upright }: { layer: HomeLayer; player: PlayerColor; upright: number }) {
    const color = shade(layer.color, player);
    const opacity = layer.opacity ?? 1;
    switch (layer.kind) {
        case 'motifs': {
            const spots = layer.spots === 'corners' ? CORNER_SPOTS : layer.spots === 'edges' ? EDGE_SPOTS : [...CORNER_SPOTS, ...EDGE_SPOTS];
            return (
                <G opacity={opacity}>
                    {spots.map(([x, y], i) => (
                        <Motif
                            key={i}
                            kind={layer.motif}
                            x={x}
                            y={y}
                            r={layer.size * C * (i % 3 === 2 ? 0.78 : 1)}
                            color={layer.colors ? layer.colors[i % layer.colors.length]! : color}
                            accent={layer.accent ? shade(layer.accent, player) : undefined}
                            rotate={layer.spin ? (i * 47) % 360 : upright}
                        />
                    ))}
                </G>
            );
        }
        case 'web': {
            const rings = [0.7, 1.25, 1.8, 2.35].map(k => k * C);
            const angles = [0, 18, 36, 54, 72, 90].map(a => (a * Math.PI) / 180);
            return (
                <G stroke={color} strokeWidth={0.8} fill="none" opacity={opacity}>
                    {angles.map((a, i) => <Line key={i} x1={0} y1={0} x2={Math.cos(a) * 2.6 * C} y2={Math.sin(a) * 2.6 * C} />)}
                    {rings.map((rad, k) => (
                        <Path
                            key={`r${k}`}
                            d={angles.slice(1).reduce((d, a, i) => {
                                const m = (angles[i]! + a) / 2;
                                return `${d} Q${(Math.cos(m) * rad * 0.86).toFixed(1)},${(Math.sin(m) * rad * 0.86).toFixed(1)} ${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`;
                            }, `M${rad.toFixed(1)},0`)}
                        />
                    ))}
                </G>
            );
        }
        case 'circuit':
            return (
                <G opacity={opacity}>
                    <FourSides>
                        <Path
                            d={`M${0.9 * C},${BAND} L${1.8 * C},${BAND} L${2.1 * C},${0.16 * C} L${3.9 * C},${0.16 * C} L${4.2 * C},${BAND} L${5.1 * C},${BAND}`}
                            stroke={color}
                            strokeWidth={1.2}
                            fill="none"
                        />
                        <Circle cx={0.9 * C} cy={BAND} r={0.09 * C} fill={color} />
                        <Circle cx={5.1 * C} cy={BAND} r={0.09 * C} fill={color} />
                        <Rect x={2.6 * C} y={0.44 * C} width={0.8 * C} height={0.22 * C} rx={0.04 * C} fill="none" stroke={color} strokeWidth={1} />
                    </FourSides>
                </G>
            );
        case 'waves':
            return (
                <G stroke={color} strokeWidth={1.3} fill="none" opacity={opacity} strokeLinecap="round">
                    <FourSides>
                        <Path d={wave(0.3 * C)} />
                        <Path d={wave(0.6 * C)} opacity={0.6} />
                    </FourSides>
                </G>
            );
        case 'grid':
            return (
                <G stroke={color} strokeWidth={0.8} opacity={opacity}>
                    {Array.from({ length: 10 }, (_, i) => (i + 0.5) * 0.6 * C).flatMap(t => [
                        <Line key={`h${t}`} x1={0} y1={t} x2={Q} y2={t} />,
                        <Line key={`v${t}`} x1={t} y1={0} x2={t} y2={Q} />,
                    ])}
                </G>
            );
        case 'grain':
            return (
                <G stroke={color} strokeWidth={1} fill="none" opacity={opacity}>
                    {Array.from({ length: 14 }, (_, i) => (i + 0.5) * 0.43 * C).map((y, i) => (
                        <Path key={i} d={`M0,${y} q${1.5 * C},${(i % 2 ? -0.14 : 0.12) * C} ${3 * C},0 t${3 * C},0`} />
                    ))}
                </G>
            );
        case 'stripes':
            return (
                <G stroke={color} strokeWidth={0.28 * C} opacity={opacity}>
                    {Array.from({ length: 18 }, (_, i) => (i - 9) * 0.7 * C).map((x, i) => (
                        <Line key={i} x1={x} y1={0} x2={x + Q} y2={Q} />
                    ))}
                </G>
            );
        case 'bands':
            return (
                <G fill={color} opacity={opacity}>
                    {Array.from({ length: 6 }, (_, i) => <Rect key={i} x={0} y={i * C} width={Q} height={0.5 * C} />)}
                </G>
            );
        case 'dunes':
            return (
                <G stroke={color} strokeWidth={1.4} fill="none" opacity={opacity} strokeLinecap="round">
                    <FourSides>
                        <Path d={`M0,${0.32 * C} C${1.5 * C},${-0.05 * C} ${3 * C},${0.6 * C} ${Q},${0.2 * C}`} />
                        <Path d={`M0,${0.62 * C} C${2 * C},${0.3 * C} ${3.6 * C},${0.85 * C} ${Q},${0.5 * C}`} opacity={0.6} />
                    </FourSides>
                </G>
            );
        case 'hatch':
            return (
                <G stroke={color} strokeWidth={1.1} opacity={opacity} strokeLinecap="round">
                    <FourSides>
                        {Array.from({ length: 19 }, (_, i) => (i + 0.5) * 0.31 * C).map((x, i) => (
                            <Line key={i} x1={x} y1={0.12 * C + (i % 2) * 0.06 * C} x2={x + 0.22 * C} y2={0.66 * C} />
                        ))}
                    </FourSides>
                </G>
            );
        case 'checker': {
            const s = 0.4 * C;
            const cells: [number, number][] = [];
            for (let i = 0; i < 15; i++) {
                for (let j = 0; j < 15; j++) {
                    if ((i < 2 || j < 2 || i > 12 || j > 12) && (i + j) % 2 === 0) cells.push([i, j]);
                }
            }
            return <G fill={color} opacity={opacity}>{cells.map(([i, j]) => <Rect key={`${i}-${j}`} x={i * s} y={j * s} width={s} height={s} />)}</G>;
        }
        case 'rays':
            return (
                <G stroke={color} strokeWidth={0.22 * C} opacity={opacity}>
                    {Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12).map((a, i) => (
                        <Line key={i} x1={Q / 2} y1={Q / 2} x2={Q / 2 + Math.cos(a) * Q} y2={Q / 2 + Math.sin(a) * Q} />
                    ))}
                </G>
            );
        case 'glow':
            return (
                <G fill={color} opacity={opacity}>
                    <Circle cx={1 * C} cy={1.1 * C} r={1.5 * C} opacity={0.22} />
                    <Circle cx={4.9 * C} cy={0.8 * C} r={1.1 * C} opacity={0.18} />
                    <Circle cx={0.8 * C} cy={4.8 * C} r={1.2 * C} opacity={0.18} />
                    <Circle cx={5.2 * C} cy={5.1 * C} r={1.4 * C} opacity={0.12} />
                </G>
            );
        case 'dots':
            return (
                <G fill={color} opacity={opacity}>
                    <FourSides>
                        {Array.from({ length: 10 }, (_, i) => (i + 0.5) * 0.6 * C).map((x, i) => (
                            <Circle key={i} cx={x} cy={i % 2 ? 0.22 * C : 0.56 * C} r={0.08 * C} />
                        ))}
                    </FourSides>
                </G>
            );
    }
}

function Slot({ style, color, x, y }: { style: BoardTheme['slots']; color: PlayerColor; x: number; y: number }) {
    const hex = COLOR_HEX[color]!;
    const r = C * 0.68;
    switch (style) {
        case 'tint':
            return (
                <>
                    <Circle cx={x} cy={y} r={r} fill={COLOR_TINT[color]} />
                    <Circle cx={x} cy={y} r={r} fill="none" stroke={hex} strokeWidth={2.5} />
                    <Circle cx={x} cy={y + C * 0.06} r={C * 0.42} fill={hex} opacity={0.18} />
                </>
            );
        case 'dark':
            return (
                <>
                    <Circle cx={x} cy={y} r={r} fill={COLOR_DARK[color]} opacity={0.5} />
                    <Circle cx={x} cy={y} r={r} fill="none" stroke={hex} strokeWidth={2} />
                </>
            );
        case 'ring':
            return (
                <>
                    <Circle cx={x} cy={y} r={r} fill={hex} opacity={0.12} />
                    <Circle cx={x} cy={y} r={r * 0.92} fill="none" stroke={hex} strokeWidth={3} />
                    <Circle cx={x} cy={y} r={C * 0.12} fill={hex} opacity={0.5} />
                </>
            );
        case 'hex': {
            const pts = Array.from({ length: 6 }, (_, i) => {
                const a = (Math.PI / 3) * i + Math.PI / 6;
                return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
            }).join(' ');
            return (
                <>
                    <Polygon points={pts} fill={COLOR_DARK[color]} opacity={0.45} />
                    <Polygon points={pts} fill="none" stroke={hex} strokeWidth={2} />
                </>
            );
        }
        case 'square':
            return (
                <>
                    <Rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={hex} opacity={0.3} />
                    <Rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="none" stroke={hex} strokeWidth={3} />
                </>
            );
        case 'glow': {
            // Bright on a dark disc: it has to show on a home of its own colour.
            const bright = COLOR_BRIGHT[color]!;
            return (
                <>
                    <Circle cx={x} cy={y} r={r} fill="rgba(0,0,0,0.4)" />
                    <Circle cx={x} cy={y} r={r} fill="none" stroke={bright} strokeWidth={6} opacity={0.3} />
                    <Circle cx={x} cy={y} r={r} fill="none" stroke={bright} strokeWidth={2} />
                </>
            );
        }
    }
}

function LudoBoardSvg({ theme, size, id, turns }: { theme: BoardTheme; size: number; id: string; turns: number }) {
    const S = BOARD_SIZE;
    const inner = S - BOARD_PAD * 2;
    const mid = 7.5 * C;
    // Gradient ids are global on web: one set per theme.
    const g = (name: string) => `${name}-${id}`;
    /** Symbols stand upright on the player's screen, however the board is turned. */
    const upright = -(turns % 4) * 90;
    const gap = theme.tileGap * C;
    const outline = theme.lane === 'outline';

    const quadStops = (c: PlayerColor): [number, string][] => {
        switch (theme.home) {
            case 'pastel': return [[0, COLOR_TINT[c]!], [0.55, COLOR_BRIGHT[c]!], [1, COLOR_HEX[c]!]];
            case 'dark': return [[0, COLOR_HEX[c]!], [0.55, COLOR_DARK[c]!], [1, theme.homeDark ?? '#000000']];
            default: return [[0, COLOR_BRIGHT[c]!], [0.45, COLOR_HEX[c]!], [1, COLOR_DARK[c]!]];
        }
    };
    const homeFill = (c: PlayerColor) => (theme.home === 'solid' ? COLOR_HEX[c]! : `url(#${g(`q-${c}`)})`);
    const laneFill = (c: PlayerColor) => {
        switch (theme.lane) {
            case 'solid': return COLOR_HEX[c]!;
            case 'pastel': return COLOR_BRIGHT[c]!;
            case 'outline': return theme.track;
            default: return `url(#${g(`lane-${c}`)})`;
        }
    };
    const tile = (c: number, r: number) => ({
        x: c * C + gap / 2,
        y: r * C + gap / 2,
        width: C - gap,
        height: C - gap,
        rx: theme.tileRadius * C,
    });

    // Lights all round the frame.
    const lights: [number, number][] = [];
    if (theme.frameLights) {
        const n = 13;
        const at = BOARD_PAD / 2;
        for (let i = 0; i < n; i++) {
            const t = 18 + (i * (S - 36)) / (n - 1);
            lights.push([t, at], [t, S - at], [at, t], [S - at, t]);
        }
    }

    return (
        <Svg width={size} height={size} viewBox={`0 0 ${S} ${S}`}>
            <Defs>
                <LinearGradient id={g('frame')} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={theme.frame[0]} />
                    <Stop offset="1" stopColor={theme.frame[1]} />
                </LinearGradient>
                {COLORS.map(c => (
                    <RadialGradient key={c} id={g(`q-${c}`)} cx="50%" cy="50%" r="70%">
                        {quadStops(c).map(([o, col]) => <Stop key={o} offset={String(o)} stopColor={col} />)}
                    </RadialGradient>
                ))}
                {COLORS.map(c => (
                    <LinearGradient key={c} id={g(`lane-${c}`)} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={COLOR_BRIGHT[c]} />
                        <Stop offset="1" stopColor={COLOR_HEX[c]} />
                    </LinearGradient>
                ))}
                <ClipPath id={g('home')}>
                    <Path d={quadrantPath(0, 0, Q, 'tl', SURFACE_RADIUS)} />
                </ClipPath>
            </Defs>

            {/* Frame + board surface */}
            <Rect width={S} height={S} rx={20} fill={`url(#${g('frame')})`} />
            <Rect
                x={theme.frameStrokeWidth / 2 + 0.25}
                y={theme.frameStrokeWidth / 2 + 0.25}
                width={S - theme.frameStrokeWidth - 0.5}
                height={S - theme.frameStrokeWidth - 0.5}
                rx={19}
                fill="none"
                stroke={theme.frameStroke}
                strokeWidth={theme.frameStrokeWidth}
            />
            {theme.sparkles && STARS.slice(0, 16).map(([u, v], i) => {
                // On the frame only: each one on an edge in turn.
                const side = i % 4;
                const t = 16 + u * (S - 32);
                const off = 2.5 + v * (BOARD_PAD - 5);
                const [x, y] = side === 0 ? [t, off] : side === 1 ? [t, S - off] : side === 2 ? [off, t] : [S - off, t];
                return <Circle key={`sp-${i}`} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.9} fill={theme.sparkles} opacity={i % 2 ? 0.55 : 0.9} />;
            })}
            {lights.map(([x, y], i) => {
                const col = theme.frameLights![i % theme.frameLights!.length];
                return (
                    <G key={`l-${i}`}>
                        <Circle cx={x} cy={y} r={3} fill={col} opacity={0.3} />
                        <Circle cx={x} cy={y} r={1.6} fill={col} />
                    </G>
                );
            })}
            <Rect x={BOARD_PAD} y={BOARD_PAD} width={inner} height={inner} rx={SURFACE_RADIUS} fill={theme.surface} />

            <G transform={`translate(${BOARD_PAD}, ${BOARD_PAD})`}>
                {theme.surfaceStars && STARS.map(([u, v], i) => (
                    <Circle key={`st-${i}`} cx={u * inner} cy={v * inner} r={i % 5 === 0 ? 1.2 : 0.7} fill={theme.surfaceStars} opacity={i % 3 ? 0.5 : 0.9} />
                ))}

                {/* Track squares */}
                {Array.from({ length: 15 }).flatMap((_, r) =>
                    Array.from({ length: 15 }).map((__, c) =>
                        isTrackCell(c, r) ? (
                            <Rect
                                key={`${c}-${r}`}
                                {...tile(c, r)}
                                fill={theme.trackAlt && (c + r) % 2 ? theme.trackAlt : theme.track}
                                stroke={theme.trackStroke}
                                strokeWidth={theme.trackStrokeWidth}
                            />
                        ) : null,
                    ),
                )}

                {/* Home lanes */}
                {COLORS.map(color =>
                    HOME_STRETCH[color]!.map(([cc, rr], i) => (
                        <G key={`lane-${color}-${i}`}>
                            <Rect
                                {...tile(cc, rr)}
                                fill={laneFill(color)}
                                stroke={outline ? COLOR_HEX[color] : 'rgba(255,255,255,0.55)'}
                                strokeWidth={outline ? 2 : 1}
                            />
                            {outline && (
                                <Rect x={cc * C + C * 0.25} y={rr * C + C * 0.25} width={C * 0.5} height={C * 0.5} rx={C * 0.1} fill={COLOR_HEX[color]} opacity={0.35} />
                            )}
                        </G>
                    )),
                )}

                {/* Start squares with direction arrows */}
                {COLORS.map(color => {
                    const entry = COLOR_ENTRY[color]!;
                    const [c, r] = LUDO_PATH[entry]!;
                    const [nc, nr] = LUDO_PATH[entry + 1]!;
                    const dx = nc - c;
                    const dy = nr - r;
                    const cx = c * C + C / 2;
                    const cy = r * C + C / 2;
                    const tip = [cx + dx * C * 0.3, cy + dy * C * 0.3];
                    const l = [cx - dx * C * 0.12 + dy * C * 0.2, cy - dy * C * 0.12 - dx * C * 0.2];
                    const rt = [cx - dx * C * 0.12 - dy * C * 0.2, cy - dy * C * 0.12 + dx * C * 0.2];
                    return (
                        <G key={`entry-${color}`}>
                            <Rect
                                {...tile(c, r)}
                                fill={COLOR_HEX[color]}
                                stroke={outline ? COLOR_BRIGHT[color] : 'rgba(255,255,255,0.55)'}
                                strokeWidth={outline ? 2 : 1}
                            />
                            <Path d={`M${l[0]},${l[1]} L${tip[0]},${tip[1]} L${rt[0]},${rt[1]} Z`} fill="#FFFFFF" />
                        </G>
                    );
                })}

                {/* Safe-square markers (the start squares have their arrows) */}
                {SAFE_POSITIONS.filter(p => !ENTRY_INDICES.has(p - 1)).map(p => {
                    const [c, r] = LUDO_PATH[p - 1]!;
                    return (
                        <Motif
                            key={`safe-${p}`}
                            kind={theme.marker.motif}
                            x={c * C + C / 2}
                            y={r * C + C / 2}
                            r={theme.marker.size * C}
                            color={theme.marker.color}
                            accent={theme.marker.accent}
                            rotate={upright}
                        />
                    );
                })}

                {/* Homes */}
                {QUADRANTS.map(({ c, bx, by, corner, angle }) => (
                    <G key={`home-${c}`}>
                        {/* Same radius as the surface, so none of it peeks out at the corner. */}
                        <Path d={quadrantPath(bx * C, by * C, Q, corner, SURFACE_RADIUS)} fill={homeFill(c)} />
                        {theme.layers.length > 0 && (
                            <G transform={`rotate(${angle} ${mid} ${mid})`}>
                                <G clipPath={`url(#${g('home')})`}>
                                    {theme.layers.map((layer, i) => (
                                        <Layer key={i} layer={layer} player={c} upright={upright - angle} />
                                    ))}
                                </G>
                            </G>
                        )}
                        {theme.panel && (
                            <>
                                {theme.panelShadow && (
                                    <Rect
                                        x={(bx + 0.8) * C}
                                        y={(by + 0.9) * C}
                                        width={4.4 * C}
                                        height={4.4 * C}
                                        rx={theme.panelRadius * C}
                                        fill={COLOR_DARK[c]}
                                        opacity={0.35}
                                    />
                                )}
                                <Rect
                                    x={(bx + 0.8) * C}
                                    y={(by + 0.8) * C}
                                    width={4.4 * C}
                                    height={4.4 * C}
                                    rx={theme.panelRadius * C}
                                    fill={theme.panel}
                                    stroke={theme.panelStroke ? shade(theme.panelStroke, c) : undefined}
                                    strokeWidth={theme.panelStroke ? theme.panelStrokeWidth ?? 1.5 : 0}
                                />
                            </>
                        )}
                        {theme.panelMotif && (
                            <Motif
                                kind={theme.panelMotif.motif}
                                x={(bx + 3) * C}
                                y={(by + 3) * C}
                                r={theme.panelMotif.size * C}
                                color={shade(theme.panelMotif.color, c)}
                                accent={theme.panelMotif.accent ? shade(theme.panelMotif.accent, c) : undefined}
                                opacity={theme.panelMotif.opacity ?? 1}
                                rotate={upright}
                            />
                        )}
                        {HOME_TOKEN_SLOTS[c]!.map(([sx, sy], k) => (
                            <Slot key={`slot-${c}-${k}`} style={theme.slots} color={c} x={sx * C} y={sy * C} />
                        ))}
                    </G>
                ))}

                {/* Finish triangles */}
                <Polygon points={`${6 * C},${6 * C} ${mid},${mid} ${6 * C},${9 * C}`} fill={homeFill('RED')} />
                <Polygon points={`${6 * C},${6 * C} ${mid},${mid} ${9 * C},${6 * C}`} fill={homeFill('BLUE')} />
                <Polygon points={`${9 * C},${6 * C} ${mid},${mid} ${9 * C},${9 * C}`} fill={homeFill('GREEN')} />
                <Polygon points={`${6 * C},${9 * C} ${mid},${mid} ${9 * C},${9 * C}`} fill={homeFill('YELLOW')} />
                <Path
                    d={`M${6 * C},${6 * C} L${9 * C},${9 * C} M${9 * C},${6 * C} L${6 * C},${9 * C}`}
                    stroke={theme.centerLines}
                    strokeWidth={1.5}
                />
                <Motif
                    kind={theme.center.motif}
                    x={mid}
                    y={mid}
                    r={theme.center.size * C}
                    color={theme.center.color}
                    accent={theme.center.accent}
                    opacity={theme.center.opacity ?? 1}
                    rotate={upright}
                />
            </G>
        </Svg>
    );
}

/**
 * Static board art, memoized: it never re-renders during play. `turns` (clockwise quarter
 * turns) puts the local player's home bottom-right; the layout looks the same from every side,
 * its symbols are drawn upright for that turn, and tokens are turned separately.
 */
export const LudoBoard = memo(function LudoBoard({ turns = 0, theme, size = BOARD_SIZE }: {
    turns?: number;
    /** The viewer's equipped board item. */
    theme?: string | null;
    /** Drawn size; the shop draws small previews. */
    size?: number;
}) {
    const id = (theme ?? 'board.classic').replace(/[^a-zA-Z0-9]/g, '');
    return (
        // The board never changes during a game: drawn once into a GPU texture, the themes'
        // hundreds of shapes cost nothing while pawns move over it.
        <View
            style={turns % 4 ? { transform: [{ rotate: `${(turns % 4) * 90}deg` }] } : undefined}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
        >
            <LudoBoardSvg theme={boardThemeOf(theme)} size={size} id={id} turns={turns} />
        </View>
    );
});
