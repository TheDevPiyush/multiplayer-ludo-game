import { memo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import {
    BOARD_PAD,
    BOARD_SIZE,
    CELL,
    COLOR_DARK,
    COLOR_ENTRY,
    COLOR_HEX,
    HOME_STRETCH,
    HOME_TOKEN_SLOTS,
    LUDO_PATH,
    SAFE_POSITIONS,
} from './geometry';

// Quadrant rect with only its outer board corner rounded
function quadrantPath(bx: number, by: number, size: number, corner: 'tl' | 'tr' | 'bl' | 'br', rad: number): string {
    const x = bx, y = by, s = size, r = rad;
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

function LudoBoardSvg() {
    const S = BOARD_SIZE;
    const C = CELL;
    const pad = BOARD_PAD;
    const inner = S - pad * 2;

    return (
        <Svg width={S} height={S}>
            <Defs>
                <LinearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#8B5A2B" />
                    <Stop offset="0.45" stopColor="#6B4226" />
                    <Stop offset="1" stopColor="#4A2E18" />
                </LinearGradient>
                <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFDF5" />
                    <Stop offset="1" stopColor="#F0E6C8" />
                </LinearGradient>
                <RadialGradient id="redG" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#F26B6B" />
                    <Stop offset="1" stopColor={COLOR_DARK.RED} />
                </RadialGradient>
                <RadialGradient id="blueG" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#6AA5F0" />
                    <Stop offset="1" stopColor={COLOR_DARK.BLUE} />
                </RadialGradient>
                <RadialGradient id="greenG" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#5DCF87" />
                    <Stop offset="1" stopColor={COLOR_DARK.GREEN} />
                </RadialGradient>
                <RadialGradient id="yellowG" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#FFCB5C" />
                    <Stop offset="1" stopColor={COLOR_DARK.YELLOW} />
                </RadialGradient>
            </Defs>

            {/* Wood frame */}
            <Rect width={S} height={S} fill="url(#wood)" rx={18} />
            <Rect x={pad} y={pad} width={inner} height={inner} fill="url(#bg)" rx={12} />

            <G transform={`translate(${pad}, ${pad})`}>
            {/* Path cells */}
            {Array.from({ length: 15 }).map((_, r) =>
                Array.from({ length: 15 }).map((_, c) => {
                    if (r < 6 && c < 6) return null;
                    if (r < 6 && c >= 9) return null;
                    if (r >= 9 && c < 6) return null;
                    if (r >= 9 && c >= 9) return null;
                    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return null;
                    const alt = (r + c) % 2 === 0;
                    return (
                        <Rect
                            key={`${r}-${c}`}
                            x={c * C}
                            y={r * C}
                            width={C}
                            height={C}
                            fill={alt ? '#FFFEF8' : '#FFF9EE'}
                            stroke="#D4C4A0"
                            strokeWidth={0.5}
                        />
                    );
                })
            )}

            {/* Home stretches: tinted lanes */}
            {[
                { color: COLOR_HEX.RED, cells: HOME_STRETCH.RED },
                { color: COLOR_HEX.BLUE, cells: HOME_STRETCH.BLUE },
                { color: COLOR_HEX.GREEN, cells: HOME_STRETCH.GREEN },
                { color: COLOR_HEX.YELLOW, cells: HOME_STRETCH.YELLOW },
            ].map((lane, li) => (
                <G key={li}>
                    {lane.cells.map(([cc, rr], i) => (
                        <Rect
                            key={`stretch-${li}-${i}`}
                            x={cc * C}
                            y={rr * C}
                            width={C}
                            height={C}
                            fill={lane.color}
                            opacity={0.88}
                        />
                    ))}
                </G>
            ))}

            {/* Color entry cell highlights */}
            {(Object.entries(COLOR_ENTRY) as [keyof typeof COLOR_ENTRY, number][]).map(([color, entry]) => {
                const cell = LUDO_PATH[entry];
                if (!cell) return null;
                return (
                    <Rect
                        key={`entry-${color}`}
                        x={cell[0] * C}
                        y={cell[1] * C}
                        width={C}
                        height={C}
                        fill={COLOR_HEX[color as string]}
                        opacity={0.45}
                    />
                );
            })}

            {/* HOMES (4 corners) — rounded outer board corners */}
            {([
                { c: 'RED' as const, bx: 0, by: 0, corner: 'tl' as const },
                { c: 'BLUE' as const, bx: 9, by: 0, corner: 'tr' as const },
                { c: 'GREEN' as const, bx: 9, by: 9, corner: 'br' as const },
                { c: 'YELLOW' as const, bx: 0, by: 9, corner: 'bl' as const },
            ]).map(({ c, bx, by, corner }) => {
                const grad = c === 'RED' ? 'redG' : c === 'BLUE' ? 'blueG' : c === 'GREEN' ? 'greenG' : 'yellowG';
                const size = 6 * C;
                return (
                    <G key={`home-${c}`}>
                        <Path
                            d={quadrantPath(bx * C, by * C, size, corner, C * 1.1)}
                            fill={`url(#${grad})`}
                        />
                        <Rect
                            x={(bx + 1) * C}
                            y={(by + 1) * C}
                            width={4 * C}
                            height={4 * C}
                            fill="#FFFEF7"
                            rx={8}
                            stroke="rgba(0,0,0,0.08)"
                            strokeWidth={1}
                        />
                        {HOME_TOKEN_SLOTS[c].map(([sx, sy], k) => (
                            <Circle
                                key={`slot-${c}-${k}`}
                                cx={sx * C}
                                cy={sy * C}
                                r={C * 0.42}
                                fill={`url(#${grad})`}
                                stroke="rgba(255,255,255,0.35)"
                                strokeWidth={1.5}
                            />
                        ))}
                    </G>
                );
            })}

            {/* CENTER triangles → finish zone */}
            <Polygon
                points={`${6 * C},${6 * C} ${7.5 * C},${7.5 * C} ${6 * C},${9 * C}`}
                fill="url(#redG)"
            />
            <Polygon
                points={`${6 * C},${6 * C} ${7.5 * C},${7.5 * C} ${9 * C},${6 * C}`}
                fill="url(#blueG)"
            />
            <Polygon
                points={`${9 * C},${6 * C} ${7.5 * C},${7.5 * C} ${9 * C},${9 * C}`}
                fill="url(#greenG)"
            />
            <Polygon
                points={`${6 * C},${9 * C} ${7.5 * C},${7.5 * C} ${9 * C},${9 * C}`}
                fill="url(#yellowG)"
            />
            {/* Inner center star */}
            <Circle cx={7.5 * C} cy={7.5 * C} r={C * 0.55} fill="#FFFEF7" />
            <SvgText x={7.5 * C} y={7.5 * C + C * 0.22} fontSize={C * 0.75} textAnchor="middle" fill="#C9A84A">★</SvgText>

            {/* SAFE STARS */}
            {SAFE_POSITIONS.map((pos, i) => {
                const cell = LUDO_PATH[pos - 1];
                if (!cell) return null;
                const [c, r] = cell;
                return (
                    <G key={i}>
                        <Circle cx={c * C + C / 2} cy={r * C + C / 2} r={C * 0.34} fill="rgba(201,168,74,0.15)" />
                        <SvgText
                            x={c * C + C / 2}
                            y={r * C + C / 2 + C * 0.2}
                            fontSize={C * 0.55}
                            textAnchor="middle"
                            fill="#B8943A"
                        >
                            ★
                        </SvgText>
                    </G>
                );
            })}

            {/* Direction arrows on entry cells */}
            {(['RED', 'BLUE', 'GREEN', 'YELLOW'] as const).map((color) => {
                const entry = COLOR_ENTRY[color];
                const cell = LUDO_PATH[entry];
                if (!cell) return null;
                const [c, r] = cell;
                const next = LUDO_PATH[entry + 1];
                if (!next) return null;
                const dx = next[0] - c;
                const dy = next[1] - r;
                const cx = c * C + C / 2;
                const cy = r * C + C / 2;
                const tip = [cx + dx * C * 0.32, cy + dy * C * 0.32];
                const left = [cx + dx * C * 0.05 + dy * C * 0.15, cy + dy * C * 0.05 - dx * C * 0.15];
                const right = [cx + dx * C * 0.05 - dy * C * 0.15, cy + dy * C * 0.05 + dx * C * 0.15];
                return (
                    <Path
                        key={`arrow-${color}`}
                        d={`M${left[0]},${left[1]} L${tip[0]},${tip[1]} L${right[0]},${right[1]} Z`}
                        fill="rgba(0,0,0,0.35)"
                    />
                );
            })}
            </G>
        </Svg>
    );
}

/** Static board art — memoized, it never re-renders during play. */
export const LudoBoard = memo(LudoBoardSvg);
