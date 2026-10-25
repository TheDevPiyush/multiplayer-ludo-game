import { memo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

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
const QUADRANTS = [
    { c: 'RED' as const, bx: 0, by: 0, corner: 'tl' as const },
    { c: 'BLUE' as const, bx: 9, by: 0, corner: 'tr' as const },
    { c: 'GREEN' as const, bx: 9, by: 9, corner: 'br' as const },
    { c: 'YELLOW' as const, bx: 0, by: 9, corner: 'bl' as const },
];
const ENTRY_INDICES = new Set(Object.values(COLOR_ENTRY));

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

function starPath(cx: number, cy: number, outer: number, inner: number): string {
    let d = '';
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        d += `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    }
    return `${d}Z`;
}

function isTrackCell(c: number, r: number): boolean {
    const inCorner = (c < 6 || c > 8) && (r < 6 || r > 8);
    const inCenter = c >= 6 && c <= 8 && r >= 6 && r <= 8;
    return !inCorner && !inCenter;
}

function LudoBoardSvg() {
    const S = BOARD_SIZE;
    const C = CELL;
    const inner = S - BOARD_PAD * 2;
    const mid = 7.5 * C;

    return (
        <Svg width={S} height={S}>
            <Defs>
                <LinearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#2B2499" />
                    <Stop offset="1" stopColor="#140F5C" />
                </LinearGradient>
                {COLORS.map(c => (
                    <RadialGradient key={c} id={`q-${c}`} cx="50%" cy="50%" r="70%">
                        <Stop offset="0" stopColor={COLOR_BRIGHT[c]} />
                        <Stop offset="0.45" stopColor={COLOR_HEX[c]} />
                        <Stop offset="1" stopColor={COLOR_DARK[c]} />
                    </RadialGradient>
                ))}
                {COLORS.map(c => (
                    <LinearGradient key={c} id={`lane-${c}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={COLOR_BRIGHT[c]} />
                        <Stop offset="1" stopColor={COLOR_HEX[c]} />
                    </LinearGradient>
                ))}
            </Defs>

            {/* Frame + board surface */}
            <Rect width={S} height={S} rx={20} fill="url(#frame)" />
            <Rect x={1} y={1} width={S - 2} height={S - 2} rx={19} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
            <Rect x={BOARD_PAD} y={BOARD_PAD} width={inner} height={inner} rx={12} fill="#FFFFFF" />

            <G transform={`translate(${BOARD_PAD}, ${BOARD_PAD})`}>
                {/* Track cells */}
                {Array.from({ length: 15 }).flatMap((_, r) =>
                    Array.from({ length: 15 }).map((__, c) =>
                        isTrackCell(c, r) ? (
                            <Rect key={`${c}-${r}`} x={c * C} y={r * C} width={C} height={C} fill="#FFFFFF" stroke="#D6DAE8" strokeWidth={1} />
                        ) : null,
                    ),
                )}

                {/* Home lanes */}
                {COLORS.map(color =>
                    HOME_STRETCH[color]!.map(([cc, rr], i) => (
                        <Rect
                            key={`lane-${color}-${i}`}
                            x={cc * C}
                            y={rr * C}
                            width={C}
                            height={C}
                            fill={`url(#lane-${color})`}
                            stroke="rgba(255,255,255,0.55)"
                            strokeWidth={1}
                        />
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
                            <Rect x={c * C} y={r * C} width={C} height={C} fill={COLOR_HEX[color]} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
                            <Path d={`M${l[0]},${l[1]} L${tip[0]},${tip[1]} L${rt[0]},${rt[1]} Z`} fill="#FFFFFF" />
                        </G>
                    );
                })}

                {/* Safe stars (non-start safe squares) */}
                {SAFE_POSITIONS.filter(p => !ENTRY_INDICES.has(p - 1)).map(p => {
                    const [c, r] = LUDO_PATH[p - 1]!;
                    return (
                        <Path
                            key={`star-${p}`}
                            d={starPath(c * C + C / 2, r * C + C / 2, C * 0.36, C * 0.16)}
                            fill="#C3C9DD"
                        />
                    );
                })}

                {/* Home bases */}
                {QUADRANTS.map(({ c, bx, by, corner }) => (
                    <G key={`home-${c}`}>
                        <Path d={quadrantPath(bx * C, by * C, 6 * C, corner, C * 0.9)} fill={`url(#q-${c})`} />
                        <Rect
                            x={(bx + 0.8) * C}
                            y={(by + 0.9) * C}
                            width={4.4 * C}
                            height={4.4 * C}
                            rx={C * 0.7}
                            fill={COLOR_DARK[c]}
                            opacity={0.35}
                        />
                        <Rect
                            x={(bx + 0.8) * C}
                            y={(by + 0.8) * C}
                            width={4.4 * C}
                            height={4.4 * C}
                            rx={C * 0.7}
                            fill="#FFFFFF"
                        />
                        {HOME_TOKEN_SLOTS[c]!.map(([sx, sy], k) => (
                            <G key={`slot-${c}-${k}`}>
                                <Circle cx={sx * C} cy={sy * C} r={C * 0.68} fill={COLOR_TINT[c]} />
                                <Circle cx={sx * C} cy={sy * C} r={C * 0.68} fill="none" stroke={COLOR_HEX[c]} strokeWidth={2.5} />
                                <Circle cx={sx * C} cy={sy * C + C * 0.06} r={C * 0.42} fill={COLOR_HEX[c]} opacity={0.18} />
                            </G>
                        ))}
                    </G>
                ))}

                {/* Finish triangles */}
                <Polygon points={`${6 * C},${6 * C} ${mid},${mid} ${6 * C},${9 * C}`} fill={`url(#q-RED)`} />
                <Polygon points={`${6 * C},${6 * C} ${mid},${mid} ${9 * C},${6 * C}`} fill={`url(#q-BLUE)`} />
                <Polygon points={`${9 * C},${6 * C} ${mid},${mid} ${9 * C},${9 * C}`} fill={`url(#q-GREEN)`} />
                <Polygon points={`${6 * C},${9 * C} ${mid},${mid} ${9 * C},${9 * C}`} fill={`url(#q-YELLOW)`} />
                <Path
                    d={`M${6 * C},${6 * C} L${9 * C},${9 * C} M${9 * C},${6 * C} L${6 * C},${9 * C}`}
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth={1.5}
                />
                <Path d={starPath(mid, mid, C * 0.42, C * 0.18)} fill="#FFFFFF" opacity={0.9} />
            </G>
        </Svg>
    );
}

/** Static board art — memoized, it never re-renders during play. */
export const LudoBoard = memo(LudoBoardSvg);
