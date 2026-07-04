import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import Svg, {
    Circle,
    Defs,
    Ellipse,
    G,
    LinearGradient,
    Path,
    Polygon,
    RadialGradient,
    Rect,
    Stop,
    Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import { VoiceControls } from '@/components/VoiceControls';
import Colors from '@/constants/Colors';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom, type RoomPlayer } from '@/hooks/useGameRoom';
import { useSocket } from '@/components/SocketProvider';
import { useVoiceRoom } from '@/components/VoiceRoomProvider';
import { setActiveRoom } from '@/util/active-room';
import { supabase } from '@/util/supabase-client';

const { width: W } = Dimensions.get('window');

const ROLL_ANIM_MS = 800;

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

const BOARD_SIZE = Math.min(W - 16, 460);
const BOARD_PAD = 7;
const CELL = (BOARD_SIZE - BOARD_PAD * 2) / 15;

const palette = Colors['dark'];

const COLOR_HEX: Record<string, string> = {
    RED: '#E04848',
    BLUE: '#4488E8',
    GREEN: '#37BD6A',
    YELLOW: '#F0B530',
};

const COLOR_BRIGHT: Record<string, string> = {
    RED: '#FF7B6E',
    BLUE: '#7FB1FF',
    GREEN: '#6FE39A',
    YELLOW: '#FFD76A',
};

const COLOR_DARK: Record<string, string> = {
    RED: '#9A2828',
    BLUE: '#2A5BAA',
    GREEN: '#1F7A41',
    YELLOW: '#A87510',
};

const SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];

// ─────────────────────────────────────────────────────────────
// BOARD PATH (52 cells, clockwise starting from RED entry)
// ─────────────────────────────────────────────────────────────

const LUDO_PATH: [number, number][] = [
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

const COLOR_ENTRY: Record<string, number> = {
    RED: 0, BLUE: 13, GREEN: 26, YELLOW: 39,
};

const HOME_STRETCH: Record<string, [number, number][]> = {
    RED:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    BLUE:   [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    GREEN:  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    YELLOW: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

const CENTER: [number, number] = [7, 7];

const HOME_BASE_BOX: Record<string, [number, number]> = {
    RED:    [0, 0],
    BLUE:   [9, 0],
    GREEN:  [9, 9],
    YELLOW: [0, 9],
};

// Four token slots inside each home base (in cell coords, board-relative)
const HOME_TOKEN_SLOTS: Record<string, [number, number][]> = {
    RED:    [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]].map(p => [p[0], p[1]] as [number, number]) as [number, number][],
    BLUE:   [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]] as [number, number][],
    GREEN:  [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]] as [number, number][],
    YELLOW: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]] as [number, number][],
};

function posToCoord(pos: number, color: string): [number, number] {
    if (pos === 57) return CENTER;
    if (pos >= 52) return HOME_STRETCH[color]?.[pos - 52] ?? CENTER;
    const entry = COLOR_ENTRY[color] ?? 0;
    const index = (entry + pos - 1) % LUDO_PATH.length;
    return LUDO_PATH[index] ?? CENTER;
}

function cellCenter(col: number, row: number) {
    return { x: BOARD_PAD + col * CELL + CELL / 2, y: BOARD_PAD + row * CELL + CELL / 2 };
}

// Detect token-stacks at same coord so we can spread them out a bit
function getStackOffset(idxInStack: number, stackSize: number): { dx: number; dy: number } {
    if (stackSize <= 1) return { dx: 0, dy: 0 };
    const r = CELL * 0.16;
    const angle = (idxInStack / stackSize) * Math.PI * 2;
    return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

// ─────────────────────────────────────────────────────────────
// SVG BOARD
// ─────────────────────────────────────────────────────────────

const DICE_DOTS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

function DiceFace({ value, size, color, glow }: { value: number; size: number; color: string; glow?: boolean }) {
    const dots = DICE_DOTS[value] ?? [];
    const r = size * 0.085;
    return (
        <Svg width={size} height={size}>
            <Defs>
                <LinearGradient id="dgrad" x1="0" y1="0" x2="0.6" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" />
                    <Stop offset="0.55" stopColor="#F2F2F8" />
                    <Stop offset="1" stopColor="#D8D8E4" />
                </LinearGradient>
                <RadialGradient id="dotG" cx="35%" cy="30%" r="80%">
                    <Stop offset="0" stopColor={color} stopOpacity="1" />
                    <Stop offset="1" stopColor="#000000" stopOpacity="0.85" />
                </RadialGradient>
            </Defs>
            {/* body */}
            <Rect
                x={1.5}
                y={1.5}
                width={size - 3}
                height={size - 3}
                rx={size * 0.22}
                fill="url(#dgrad)"
                stroke={glow ? color : '#B9B9CB'}
                strokeWidth={glow ? 3 : 1.5}
            />
            {/* top gloss */}
            <Rect
                x={size * 0.1}
                y={size * 0.06}
                width={size * 0.8}
                height={size * 0.34}
                rx={size * 0.15}
                fill="rgba(255,255,255,0.65)"
            />
            {dots.map(([cx, cy], i) => (
                <G key={i}>
                    <Circle cx={cx * size} cy={cy * size + 0.8} r={r} fill="rgba(0,0,0,0.25)" />
                    <Circle cx={cx * size} cy={cy * size} r={r} fill={color} />
                    <Circle cx={cx * size - r * 0.3} cy={cy * size - r * 0.35} r={r * 0.32} fill="rgba(255,255,255,0.7)" />
                </G>
            ))}
        </Svg>
    );
}

// 5-point star path used for safe cells and the board center
function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
    let d = '';
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        d += `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`;
    }
    return d + 'Z';
}

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

function MarbleToken({ color, tokenIndex, size, selected }: {
    color: string;
    tokenIndex: number;
    size: number;
    selected?: boolean;
}) {
    const hex = COLOR_HEX[color] ?? '#888';
    const dark = COLOR_DARK[color] ?? '#444';
    const bright = COLOR_BRIGHT[color] ?? '#aaa';
    const r = size * 0.42;

    return (
        <Svg width={size} height={size}>
            <Defs>
                <RadialGradient id={`tg-${color}-${tokenIndex}`} cx="38%" cy="32%" r="68%">
                    <Stop offset="0" stopColor={bright} />
                    <Stop offset="0.55" stopColor={hex} />
                    <Stop offset="1" stopColor={dark} />
                </RadialGradient>
            </Defs>
            <Ellipse cx={size / 2} cy={size * 0.9} rx={r * 0.85} ry={r * 0.18} fill="rgba(0,0,0,0.28)" />
            <Circle cx={size / 2} cy={size / 2} r={r} fill={`url(#tg-${color}-${tokenIndex})`} />
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={selected ? '#FFFFFF' : 'rgba(0,0,0,0.18)'}
                strokeWidth={selected ? 2.5 : 1.2}
                fill="none"
            />
            <Circle cx={size * 0.36} cy={size * 0.3} r={r * 0.22} fill="rgba(255,255,255,0.55)" />
            <Circle cx={size * 0.52} cy={size * 0.52} r={r * 0.38} fill="rgba(0,0,0,0.12)" />
            <SvgText
                x={size / 2}
                y={size / 2 + size * 0.07}
                fontSize={size * 0.28}
                fontWeight="700"
                textAnchor="middle"
                fill="#FFFFFF"
            >
                {tokenIndex + 1}
            </SvgText>
        </Svg>
    );
}

function LudoBoard() {
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

// ─────────────────────────────────────────────────────────────
// TOKEN
// ─────────────────────────────────────────────────────────────

function Token({
    color,
    coord,
    tokenIndex,
    onPress,
    canMove,
    captured,
}: {
    color: string;
    coord: { x: number; y: number };
    tokenIndex: number;
    onPress?: (i: number) => void;
    canMove: boolean;
    captured: boolean;
}) {
    const x = useSharedValue(coord.x);
    const y = useSharedValue(coord.y);
    const scale = useSharedValue(1);
    const pulse = useSharedValue(0);
    const flash = useSharedValue(0);

    useEffect(() => {
        const dx = Math.abs(x.value - coord.x);
        const dy = Math.abs(y.value - coord.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) {
            x.value = withSpring(coord.x, { damping: 14, stiffness: 130 });
            y.value = withSpring(coord.y, { damping: 14, stiffness: 130 });
            // little bounce on land
            scale.value = withSequence(
                withTiming(1.18, { duration: 220, easing: Easing.out(Easing.cubic) }),
                withSpring(1),
            );
        }
    }, [coord.x, coord.y]);

    useEffect(() => {
        if (canMove) {
            pulse.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                ),
                -1,
                false,
            );
        } else {
            pulse.value = withTiming(0, { duration: 200 });
        }
    }, [canMove]);

    useEffect(() => {
        if (captured) {
            flash.value = withSequence(
                withTiming(1, { duration: 120 }),
                withTiming(0, { duration: 380 }),
            );
        }
    }, [captured]);

    const animatedStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        width: CELL * 0.78,
        height: CELL * 0.78,
        left: x.value - (CELL * 0.78) / 2,
        top: y.value - (CELL * 0.78) / 2,
        transform: [{ scale: scale.value + pulse.value * 0.12 }],
        zIndex: canMove ? 200 : 10,
    }));

    const flashStyle = useAnimatedStyle(() => ({
        opacity: flash.value,
    }));

    const ringStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        width: CELL * 0.82,
        height: CELL * 0.82,
        left: x.value - (CELL * 0.82) / 2,
        top: y.value - (CELL * 0.82) / 2,
        borderRadius: 100,
        borderWidth: 2.5,
        borderColor: COLOR_HEX[color],
        opacity: pulse.value * 0.85,
        transform: [{ scale: 1 + pulse.value * 0.35 }],
    }));

    return (
        <Animated.View style={animatedStyle}>
            <Animated.View style={ringStyle} pointerEvents="none" />
            <Pressable
                onPress={() => onPress?.(tokenIndex)}
                disabled={!onPress || !canMove}
                style={{ width: CELL * 0.78, height: CELL * 0.78 }}
            >
                <MarbleToken
                    color={color}
                    tokenIndex={tokenIndex}
                    size={CELL * 0.78}
                    selected={canMove}
                />
            </Pressable>
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    styles.captureFlash,
                    flashStyle,
                ]}
            />
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// PLAYER STRIP (top + bottom rosters)
// ─────────────────────────────────────────────────────────────

type StripPlayer = RoomPlayer & {
    isActive: boolean;
    isYou: boolean;
    isOnline: boolean;
    inVoice: boolean;
    voiceMuted: boolean;
    isDisconnecting: boolean;
};

function PlayerStrip({ player }: { player: StripPlayer }) {
    const ring = useSharedValue(0);
    useEffect(() => {
        if (player.isActive) {
            ring.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 800 }),
                    withTiming(0, { duration: 800 }),
                ),
                -1,
                false,
            );
        } else {
            ring.value = withTiming(0, { duration: 200 });
        }
    }, [player.isActive]);

    const ringStyle = useAnimatedStyle(() => ({
        opacity: ring.value * 0.7,
        transform: [{ scale: 1 + ring.value * 0.12 }],
    }));

    const color = COLOR_HEX[player.color];

    return (
        <GlassPanel
            intensity="medium"
            accent={player.isActive ? color : undefined}
            style={[styles.strip, player.isActive && { borderColor: color + '55' }]}
        >
            <RNView style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 2, borderColor: color }, ringStyle]} />
                <RNView style={[styles.stripAvatar, { backgroundColor: color, opacity: player.isOnline ? 1 : 0.4 }]}>
                    <Text weight="bold" style={{ color: '#fff', fontSize: 11 }}>
                        {player.user.username.slice(0, 2).toUpperCase()}
                    </Text>
                </RNView>
            </RNView>
            <RNView style={{ flex: 1, gap: 2 }}>
                <Text weight="bold" style={styles.stripName} numberOfLines={1}>
                    {player.isYou ? 'You' : `@${player.user.username}`}
                </Text>
                <RNView style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {player.inVoice && (
                        <FontAwesome
                            name={player.voiceMuted ? 'microphone-slash' : 'microphone'}
                            size={9}
                            color={player.voiceMuted ? palette.mutedText : color}
                        />
                    )}
                    {!player.isOnline ? (
                        <Text weight="medium" style={[styles.stripSub, { color: '#E8A520' }]}>
                            {player.isDisconnecting ? 'reconnecting…' : 'offline'}
                        </Text>
                    ) : player.rank ? (
                        <Text weight="medium" style={[styles.stripSub, { color: '#37BD6A' }]}>#{player.rank} finished</Text>
                    ) : (
                        <Text weight="medium" style={styles.stripSub}>
                            {player.color.toLowerCase()}
                        </Text>
                    )}
                </RNView>
            </RNView>
            {player.isActive && (
                <RNView style={[styles.activeDot, { backgroundColor: color }]} />
            )}
        </GlassPanel>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function GameBoardScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const { gameCode: rawCode, roomId: rawRoomId } = useLocalSearchParams<any>();
    const gameCode = typeof rawCode === 'string' ? rawCode : String(rawCode?.[0] ?? '');
    const roomId = typeof rawRoomId === 'string' ? rawRoomId : String(rawRoomId?.[0] ?? '');

    const { connectionPhase, isRealtimeReady } = useSocket();
    const voice = useVoiceRoom();
    const { rollDice, moveToken, skipTurn } = useGameActions(gameCode);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [rolling, setRolling] = useState(false);
    /** Last rolled value — kept visible after turn changes until the next roll. */
    const [lastShownDice, setLastShownDice] = useState<number | null>(null);
    const [rollingFace, setRollingFace] = useState(6);
    /** Color of the player whose roll is animating (for opponent rolls). */
    const [rollingColor, setRollingColor] = useState<string | null>(null);
    const [disconnectingIds, setDisconnectingIds] = useState<Set<string>>(new Set());
    const [capturedKey, setCapturedKey] = useState<string | null>(null);
    const [winnerInfo, setWinnerInfo] = useState<{ winnerId: string; winnerColor: string } | null>(null);
    const [dialog, setDialog] = useState({
        visible: false, title: '', message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const leftRef = useRef(false);
    const rollingRef = useRef(false);
    const currentUserIdRef = useRef<string | null>(null);
    const runRollAnimationRef = useRef<(finalValue: number, rollerColor: string) => Promise<void>>(
        async () => {},
    );
    currentUserIdRef.current = currentUserId;
    rollingRef.current = rolling;

    const { room } = useGameRoom({
        roomId,
        gameCode,
        onEvent: (e) => {
            if (e.type === 'dice') {
                // Local player already animates in handleRollDice — skip duplicate.
                if (e.byUserId !== currentUserIdRef.current) {
                    void runRollAnimationRef.current(e.diceValue, e.color);
                }
                return;
            }
            if (e.type === 'capture') {
                setCapturedKey(`${e.capturedUserId}:${e.capturedTokenIndex}:${Date.now()}`);
            }
            if (e.type === 'presence:disconnecting') {
                setDisconnectingIds(prev => new Set(prev).add(e.userId));
            }
            if (e.type === 'presence:connected' || e.type === 'presence:reconnected') {
                setDisconnectingIds(prev => {
                    const next = new Set(prev);
                    next.delete(e.userId);
                    return next;
                });
            }
            if (e.type === 'presence:disconnected') {
                setDisconnectingIds(prev => {
                    const next = new Set(prev);
                    next.delete(e.userId);
                    return next;
                });
            }
            if (e.type === 'over') {
                setWinnerInfo({ winnerId: e.winnerId, winnerColor: e.winnerColor });
            }
            if (e.type === 'cancelled') {
                showError('Room ended', 'The room has been closed.');
                setTimeout(() => {
                    leftRef.current = true;
                    void setActiveRoom(null);
                    router.replace('/(tabs)');
                }, 1500);
            }
        },
    });

    const players = room?.players ?? [];
    const currentColor = room?.currentTurnColor ?? 'RED';
    const diceValue = room?.currentDice ?? null;

    const selfPlayer = useMemo(
        () => players.find(p => p.userId === currentUserId),
        [players, currentUserId],
    );

    const isMyTurn = !!selfPlayer && selfPlayer.color === currentColor && room?.status === 'PLAYING';

    // Persist active room
    useEffect(() => {
        if (roomId && gameCode && room) {
            void setActiveRoom({
                roomId,
                gameCode,
                maxPlayers: room.maxPlayers,
                screen: 'board',
            });
        }
    }, [roomId, gameCode, room?.maxPlayers]);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id ?? null);
        });
    }, []);

    // Keep voice alive across lobby → board; resync peers when board loads
    const voiceSyncedRef = useRef(false);
    useEffect(() => {
        voiceSyncedRef.current = false;
    }, [roomId]);

    useEffect(() => {
        if (!room?.voiceEnabled || !roomId || !isRealtimeReady || room?.status !== 'PLAYING') return;
        if (voiceSyncedRef.current) return;
        voiceSyncedRef.current = true;

        if (voice.inRoom && voice.roomId === roomId) {
            voice.resync();
        } else {
            void voice.join(roomId);
        }
    }, [room?.voiceEnabled, roomId, room?.status, isRealtimeReady, voice.inRoom, voice.roomId, voice.join, voice.resync]);

    // Remember every rolled value so it stays visible after the turn advances.
    useEffect(() => {
        if (diceValue !== null) setLastShownDice(diceValue);
    }, [diceValue]);

    // ── Dice animation ──
    const diceRotate = useSharedValue(0);
    const diceScale = useSharedValue(1);
    const diceStyle = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${diceRotate.value}deg` },
            { scale: diceScale.value },
        ],
    }));

    const runRollAnimation = useCallback(async (finalValue: number, rollerColor: string) => {
        if (rollingRef.current) return;

        setRolling(true);
        setRollingColor(rollerColor);
        rollingRef.current = true;

        diceRotate.value = withTiming(diceRotate.value + 720, {
            duration: ROLL_ANIM_MS,
            easing: Easing.out(Easing.exp),
        });
        diceScale.value = withSequence(
            withTiming(1.22, { duration: 160 }),
            withSpring(1),
        );

        const fakeInterval = setInterval(() => {
            setRollingFace(Math.floor(Math.random() * 6) + 1);
        }, 80);

        await sleep(ROLL_ANIM_MS);
        clearInterval(fakeInterval);

        setLastShownDice(finalValue);
        setRolling(false);
        setRollingColor(null);
        rollingRef.current = false;
    }, [diceRotate, diceScale]);

    runRollAnimationRef.current = runRollAnimation;

    const handleRollDice = async () => {
        if (!isMyTurn || rolling || diceValue !== null || !isRealtimeReady || !selfPlayer) return;

        setRolling(true);
        setRollingColor(selfPlayer.color);
        rollingRef.current = true;
        let fakeInterval: ReturnType<typeof setInterval> | null = null;

        try {
            diceRotate.value = withTiming(diceRotate.value + 720, {
                duration: ROLL_ANIM_MS,
                easing: Easing.out(Easing.exp),
            });
            diceScale.value = withSequence(
                withTiming(1.22, { duration: 160 }),
                withSpring(1),
            );

            fakeInterval = setInterval(() => {
                setRollingFace(Math.floor(Math.random() * 6) + 1);
            }, 80);

            const [result] = await Promise.all([rollDice(), sleep(ROLL_ANIM_MS)]);
            if (fakeInterval) clearInterval(fakeInterval);

            if (!result.ok) {
                console.warn('[board] rollDice failed:', result.error);
                setDialog({
                    visible: true,
                    title: 'Could not roll',
                    message: result.error,
                    actions: undefined,
                });
                return;
            }
            setLastShownDice(result.data?.diceValue ?? null);
        } catch (e) {
            if (fakeInterval) clearInterval(fakeInterval);
        } finally {
            setRolling(false);
            setRollingColor(null);
            rollingRef.current = false;
        }
    };

    const visibleDice = diceValue ?? lastShownDice;
    const diceFaceColor = rolling
        ? COLOR_HEX[rollingColor ?? currentColor] ?? palette.mutedText
        : diceValue !== null
            ? COLOR_HEX[currentColor] ?? palette.mutedText
            : palette.mutedText;
    const canRoll = isMyTurn && diceValue === null && !rolling && isRealtimeReady;

    // Auto-skip after a moment if no valid move.
    // Re-runs when token positions change (e.g. after a capture lands on you).
    const positionsKey = selfPlayer?.tokenPositions.join(',') ?? '';
    useEffect(() => {
        if (!isMyTurn || diceValue === null || !selfPlayer) return;
        const hasValidMove = selfPlayer.tokenPositions.some(pos => {
            if (pos === 0) return diceValue === 6;
            if (pos === 57) return false;
            return pos + diceValue <= 57;
        });
        if (hasValidMove) return;

        const t = setTimeout(async () => {
            await skipTurn();
        }, 1300);
        return () => clearTimeout(t);
    }, [isMyTurn, diceValue, selfPlayer?.id, positionsKey]);

    const handleTokenPress = async (tokenIndex: number) => {
        if (!isMyTurn || diceValue === null || !selfPlayer) return;
        const fromPos = selfPlayer.tokenPositions[tokenIndex];
        if (fromPos === undefined) return;
        // Client-side guards (server re-validates and computes toPosition):
        if (fromPos === 0 && diceValue !== 6) return;
        if (fromPos === 57) return;
        if (fromPos !== 0 && fromPos + diceValue > 57) return;

        await moveToken(tokenIndex);
    };

    // Token coords & stacking
    type TokenItem = {
        key: string;
        color: string;
        coord: { x: number; y: number };
        tokenIndex: number;
        userId: string;
        canMove: boolean;
        captured: boolean;
    };

    const tokenItems = useMemo<TokenItem[]>(() => {
        const items: TokenItem[] = [];
        const positionMap = new Map<string, { color: string; userId: string; tokenIndex: number }[]>();

        for (const p of players) {
            for (let ti = 0; ti < (p.tokenPositions ?? []).length; ti++) {
                const pos = p.tokenPositions[ti];
                const baseCoord =
                    pos === 0
                        ? (() => {
                              const slot = HOME_TOKEN_SLOTS[p.color]?.[ti];
                              return slot ? { col: slot[0], row: slot[1] } : null;
                          })()
                        : (() => {
                              const [c, r] = posToCoord(pos, p.color);
                              return { col: c + 0.5, row: r + 0.5 };
                          })();
                if (!baseCoord) continue;
                const key = `${baseCoord.col.toFixed(2)}-${baseCoord.row.toFixed(2)}`;
                let arr = positionMap.get(key);
                if (!arr) {
                    arr = [];
                    positionMap.set(key, arr);
                }
                arr.push({ color: p.color, userId: p.userId, tokenIndex: ti });
            }
        }

        for (const p of players) {
            for (let ti = 0; ti < (p.tokenPositions ?? []).length; ti++) {
                const pos = p.tokenPositions[ti];
                let cx: number, cy: number;
                if (pos === 0) {
                    const slot = HOME_TOKEN_SLOTS[p.color]?.[ti];
                    if (!slot) continue;
                    cx = slot[0] * CELL;
                    cy = slot[1] * CELL;
                } else {
                    const [c, r] = posToCoord(pos, p.color);
                    const center = cellCenter(c, r);
                    cx = center.x;
                    cy = center.y;
                }

                const key = `${(cx / CELL).toFixed(2)}-${(cy / CELL).toFixed(2)}`;
                const stack = positionMap.get(key) ?? [];
                const idxInStack = stack.findIndex(s => s.userId === p.userId && s.tokenIndex === ti);
                const off = pos !== 0 ? getStackOffset(idxInStack, stack.length) : { dx: 0, dy: 0 };

                const canMove =
                    isMyTurn &&
                    p.userId === currentUserId &&
                    diceValue !== null &&
                    (pos === 0
                        ? diceValue === 6
                        : pos !== 57 && pos + diceValue <= 57);

                const isCapturedNow =
                    !!capturedKey &&
                    capturedKey.startsWith(`${p.userId}:${ti}:`) &&
                    pos === 0;

                items.push({
                    key: `${p.color}-${ti}`,
                    color: p.color,
                    coord: { x: cx + off.dx, y: cy + off.dy },
                    tokenIndex: ti,
                    userId: p.userId,
                    canMove,
                    captured: isCapturedNow,
                });
            }
        }

        return items;
    }, [players, isMyTurn, diceValue, currentUserId, capturedKey]);

    // ── Strip data ──
    const stripPlayers = useMemo<StripPlayer[]>(
        () =>
            players.map(p => {
                const isMe = p.userId === currentUserId;
                const inVoice = voice.peers.some(vp => vp.userId === p.userId) || (isMe && voice.inRoom);
                const muted = isMe ? voice.isMuted : (voice.peers.find(vp => vp.userId === p.userId)?.muted ?? false);
                return {
                    ...p,
                    isActive: p.color === currentColor && room?.status === 'PLAYING',
                    isYou: isMe,
                    isOnline: p.status === 'CONNECTED' || isMe,
                    inVoice,
                    voiceMuted: muted,
                    isDisconnecting: disconnectingIds.has(p.userId),
                };
            }),
        [players, currentColor, currentUserId, voice.peers, voice.inRoom, voice.isMuted, disconnectingIds, room?.status],
    );

    const topPlayers = stripPlayers.filter(p => p.color === 'RED' || p.color === 'BLUE');
    const bottomPlayers = stripPlayers.filter(p => p.color === 'GREEN' || p.color === 'YELLOW');

    const hideDialog = () => setDialog(p => ({ ...p, visible: false }));
    const showError = (title: string, message: string) =>
        setDialog({ visible: true, title, message, actions: undefined });

    async function notifyServerLeave() {
        if (!gameCode) return { ok: true as const };
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return { ok: false as const, error: 'Not signed in.' };
        return leaveRoom(token, gameCode);
    }

    const openExit = () => {
        setDialog({
            visible: true,
            title: 'Leave Game',
            message: 'You will forfeit this game and lose any progress.',
            actions: [
                { label: 'Stay', onPress: hideDialog },
                {
                    label: 'Leave',
                    onPress: () => {
                        void (async () => {
                            await notifyServerLeave();
                            voice.leave();
                            await setActiveRoom(null);
                            leftRef.current = true;
                            hideDialog();
                            router.replace('/(tabs)');
                        })();
                    },
                },
            ],
        });
    };

    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (leftRef.current) {
                leftRef.current = false;
                return;
            }
            e.preventDefault();
            openExit();
        });
        return unsub;
    }, [navigation]);

    // Win screen handlers
    const closeWin = () => {
        void (async () => {
            voice.leave();
            await setActiveRoom(null);
            leftRef.current = true;
            await notifyServerLeave();
            router.replace('/(tabs)');
        })();
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top }]}>
            {/* TOP BAR */}
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={openExit} style={styles.iconBtnSmall}>
                    <FontAwesome name="chevron-left" size={13} color={palette.mutedText} />
                </TouchableOpacity>
                <RNView style={styles.statusChip}>
                    <RNView style={[
                        styles.statusDot,
                        { backgroundColor: isRealtimeReady ? '#37BD6A' : '#E8A520' },
                    ]} />
                    <Text weight="medium" style={styles.statusText}>
                        {connectionPhase === 'connected' ? 'Live' :
                         connectionPhase === 'offline' ? 'No network' :
                         connectionPhase === 'reconnecting' ? 'Reconnecting…' :
                         connectionPhase === 'connecting' ? 'Connecting…' :
                         'Connection lost'}
                    </Text>
                </RNView>
            </RNView>

            {/* TOP STRIP */}
            <RNView style={styles.stripRow}>
                {topPlayers.map(p => <PlayerStrip key={p.id} player={p} />)}
            </RNView>

            {/* BOARD */}
            <RNView style={styles.boardWrap}>
                <RNView style={styles.boardShadow} />
                <LudoBoard />
                {tokenItems.map(t => (
                    <Token
                        key={t.key}
                        color={t.color}
                        coord={t.coord}
                        tokenIndex={t.tokenIndex}
                        canMove={t.canMove}
                        captured={t.captured}
                        onPress={t.userId === currentUserId ? handleTokenPress : undefined}
                    />
                ))}
            </RNView>

            {/* BOTTOM STRIP */}
            <RNView style={styles.stripRow}>
                {bottomPlayers.map(p => <PlayerStrip key={p.id} player={p} />)}
            </RNView>

            {/* DICE / ACTIONS */}
            <RNView style={{ paddingBottom: insets.bottom + 10 }}>
                {room?.voiceEnabled && (
                    <RNView style={styles.voiceBar}>
                        <VoiceControls roomId={roomId} compact showLeave={false} />
                    </RNView>
                )}
                <RNView style={styles.bottomBar}>
                <RNView style={styles.turnPill}>
                    <RNView style={[styles.turnDot, { backgroundColor: COLOR_HEX[currentColor] ?? '#fff' }]} />
                    <Text weight="semiBold" style={styles.turnText}>
                        {isMyTurn ? 'Your turn' : `${currentColor[0]}${currentColor.slice(1).toLowerCase()}'s turn`}
                    </Text>
                </RNView>

                <RNView style={styles.diceWrap}>
                    <TouchableOpacity
                        activeOpacity={canRoll ? 0.85 : 1}
                        style={[styles.rollBtn, !canRoll && styles.rollBtnDisabled]}
                        disabled={!canRoll}
                        onPress={handleRollDice}
                    >
                        <Animated.View style={diceStyle}>
                            <DiceFace
                                value={rolling ? rollingFace : (visibleDice ?? 1)}
                                size={64}
                                color={diceFaceColor}
                                glow={rolling || diceValue !== null}
                            />
                        </Animated.View>
                    </TouchableOpacity>
                    <Text weight="medium" style={styles.diceHint}>
                        {!isMyTurn
                            ? rolling
                                ? 'Rolling…'
                                : diceValue !== null
                                    ? 'Waiting for move…'
                                    : 'Waiting…'
                            : rolling
                                ? 'Rolling…'
                                : diceValue !== null
                                    ? 'Tap a token to move'
                                    : 'Tap to roll'}
                    </Text>
                </RNView>

                <RNView style={styles.bottomActions} />
                </RNView>
            </RNView>

            {/* Reconnecting banner */}
            {!isRealtimeReady && (
                <RNView style={[styles.banner, { top: insets.top + 8 }]}>
                    <Text weight="bold" style={styles.bannerText}>
                        {connectionPhase === 'offline' ? 'No internet — waiting for network…' :
                         connectionPhase === 'reconnecting' ? 'Reconnecting to game…' :
                         'Connecting to server…'}
                    </Text>
                </RNView>
            )}

            {/* Win overlay */}
            {winnerInfo && (
                <RNView style={styles.winOverlay}>
                    <RNView style={styles.winCard}>
                        <RNView style={[styles.winCrown, { backgroundColor: COLOR_HEX[winnerInfo.winnerColor] + '22' }]}>
                            <FontAwesome name="trophy" size={36} color={COLOR_HEX[winnerInfo.winnerColor]} />
                        </RNView>
                        <Text weight="bold" style={styles.winTitle}>
                            {winnerInfo.winnerId === currentUserId ? '🎉 You Won!' : 'Game Over'}
                        </Text>
                        <Text weight="medium" style={styles.winSub}>
                            {winnerInfo.winnerId === currentUserId
                                ? 'Champion of this round!'
                                : `Winner: ${players.find(p => p.userId === winnerInfo.winnerId)?.user.username ?? 'Unknown'}`}
                        </Text>
                        <TouchableOpacity style={styles.winBtn} onPress={closeWin} activeOpacity={0.85}>
                            <Text weight="bold" style={styles.winBtnText}>Back to Home</Text>
                        </TouchableOpacity>
                    </RNView>
                </RNView>
            )}

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={hideDialog}
                actions={dialog.actions}
            />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8,
    },
    iconBtnSmall: {
        width: 36, height: 36,
        borderRadius: 10,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { fontSize: 11, color: palette.mutedText },

    stripRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    strip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    stripAvatar: {
        width: 30, height: 30,
        borderRadius: 15,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    },
    stripName: { fontSize: 12, color: palette.text },
    stripSub: { fontSize: 10, color: palette.mutedText, letterSpacing: 0.4, textTransform: 'capitalize' },
    activeDot: { width: 8, height: 8, borderRadius: 4 },

    boardWrap: {
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        alignSelf: 'center',
        marginVertical: 4,
    },
    boardShadow: {
        position: 'absolute',
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.35)',
        top: 5,
        left: 3,
        zIndex: -1,
    },

    captureFlash: {
        borderRadius: 100,
        backgroundColor: '#FFFFFF',
    },

    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    turnPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: palette.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    turnDot: { width: 8, height: 8, borderRadius: 4 },
    turnText: { fontSize: 12, color: palette.text },
    voiceBar: { width: '100%', paddingHorizontal: 20, marginBottom: 8 },
    diceWrap: { alignItems: 'center', gap: 6 },
    diceHint: { fontSize: 11, color: palette.mutedText },
    rollBtn: {
        padding: 4,
        borderRadius: 14,
    },
    rollBtnDisabled: { opacity: 0.45 },
    bottomActions: { width: 80, height: 1 },

    banner: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: '#E8A520',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
        zIndex: 1000,
    },
    bannerText: { fontSize: 12, color: '#fff' },

    winOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
    },
    winCard: {
        width: '82%',
        backgroundColor: palette.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.border,
        paddingVertical: 28,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 14,
    },
    winCrown: {
        width: 80, height: 80,
        borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
    },
    winTitle: { fontSize: 22, color: palette.text },
    winSub: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
    winBtn: {
        marginTop: 8,
        paddingVertical: 14, paddingHorizontal: 28,
        borderRadius: 14,
        backgroundColor: '#37BD6A',
    },
    winBtnText: { color: '#fff', fontSize: 14, letterSpacing: 0.3 },
});
