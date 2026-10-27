import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import {
    CAPTURE_RETURN_DELAY_MS,
    CAPTURE_RETURN_MS,
    CELL,
    COLOR_BRIGHT,
    COLOR_DARK,
    COLOR_HEX,
    HOP_MS,
    cellCenter,
    posToCoord,
    turnPoint,
} from './geometry';

const PAWN_W = CELL * 1.02;
const PAWN_H = PAWN_W * 1.3;
/** Where the pawn's base sits inside its 100×130 artwork. */
const BASE_FRAC = 108 / 130;
/** Pawns stand slightly below the cell centre so they look planted on it. */
const STAND_OFFSET = CELL * 0.2;

/** Glossy 3D pawn — head, collar, flared body and base, lit from the top-left. */
export const Pawn = memo(function Pawn({ color, width }: { color: string; width: number }) {
    const hex = COLOR_HEX[color] ?? '#888';
    const dark = COLOR_DARK[color] ?? '#444';
    const bright = COLOR_BRIGHT[color] ?? '#ccc';
    const id = color.toLowerCase();
    return (
        <Svg width={width} height={width * 1.3} viewBox="0 0 100 130">
            <Defs>
                <LinearGradient id={`body-${id}`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={dark} />
                    <Stop offset="0.38" stopColor={bright} />
                    <Stop offset="0.62" stopColor={hex} />
                    <Stop offset="1" stopColor={dark} />
                </LinearGradient>
                <RadialGradient id={`head-${id}`} cx="36%" cy="30%" r="72%">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
                    <Stop offset="0.22" stopColor={bright} />
                    <Stop offset="0.65" stopColor={hex} />
                    <Stop offset="1" stopColor={dark} />
                </RadialGradient>
                <LinearGradient id={`base-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={hex} />
                    <Stop offset="1" stopColor={dark} />
                </LinearGradient>
            </Defs>
            {/* ground shadow */}
            <Ellipse cx={50} cy={118} rx={36} ry={9} fill="rgba(0,0,0,0.32)" />
            {/* base */}
            <Ellipse cx={50} cy={109} rx={37} ry={13} fill={dark} />
            <Ellipse cx={50} cy={104} rx={37} ry={13} fill={`url(#base-${id})`} />
            {/* body */}
            <Path d="M21,104 C27,84 38,72 40,54 L60,54 C62,72 73,84 79,104 Z" fill={`url(#body-${id})`} />
            <Path d="M21,104 C27,84 38,72 40,54 L60,54 C62,72 73,84 79,104 Z" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
            {/* collar */}
            <Ellipse cx={50} cy={55} rx={17} ry={6} fill={dark} />
            <Ellipse cx={50} cy={53} rx={17} ry={6} fill={hex} />
            {/* head */}
            <Circle cx={50} cy={33} r={23} fill={`url(#head-${id})`} />
            <Circle cx={50} cy={33} r={23} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth={1.5} />
            {/* highlights */}
            <Ellipse cx={42} cy={24} rx={8} ry={5.5} fill="rgba(255,255,255,0.75)" transform="rotate(-25 42 24)" />
            <Path d="M41,62 C40,76 34,88 29,100" stroke="rgba(255,255,255,0.45)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </Svg>
    );
});

type Point = { x: number; y: number };

function pathPoints(color: string, from: number, to: number, final: Point, turns: number): Point[] {
    const pts: Point[] = [];
    for (let p = from + 1; p < to; p++) {
        const [c, r] = posToCoord(p, color);
        pts.push(turnPoint(cellCenter(c, r), turns));
    }
    pts.push(final);
    return pts;
}

type TokenProps = {
    color: string;
    /** Target pixel position (cell centre plus any stack offset). */
    coord: Point;
    /** Engine position — used to hop along the track cell by cell. */
    pos: number;
    tokenIndex: number;
    onPress?: (i: number) => void;
    canMove: boolean;
    captured: boolean;
    /** Quarter turns of the board this token is drawn on (see `turnsFor`). */
    turns?: number;
};

/** Re-render only when something visible changed (`coord` is a new object on every room update). */
function sameToken(a: TokenProps, b: TokenProps): boolean {
    return a.coord.x === b.coord.x && a.coord.y === b.coord.y && a.pos === b.pos && a.color === b.color
        && a.tokenIndex === b.tokenIndex && a.canMove === b.canMove && a.captured === b.captured && a.onPress === b.onPress && a.turns === b.turns;
}

export const Token = memo(function Token({
    color,
    coord,
    pos,
    tokenIndex,
    onPress,
    canMove,
    captured,
    turns = 0,
}: TokenProps) {
    const x = useSharedValue(coord.x);
    const y = useSharedValue(coord.y);
    const lift = useSharedValue(0);
    const bob = useSharedValue(0);
    const ring = useSharedValue(0);
    const flash = useSharedValue(0);
    const prevPos = useRef(pos);

    useEffect(() => {
        const from = prevPos.current;
        prevPos.current = pos;
        const final = { x: coord.x, y: coord.y };

        if (pos !== from && pos > from && from !== 0 && pos - from <= 6) {
            // Normal move: hop through every cell on the way.
            const pts = pathPoints(color, from, pos, final, turns);
            const ease = Easing.inOut(Easing.quad);
            x.value = withSequence(...pts.map(p => withTiming(p.x, { duration: HOP_MS, easing: ease })) as [any, ...any[]]);
            y.value = withSequence(...pts.map(p => withTiming(p.y, { duration: HOP_MS, easing: ease })) as [any, ...any[]]);
            lift.value = withSequence(
                ...pts.flatMap(() => [
                    withTiming(1, { duration: HOP_MS / 2, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: HOP_MS / 2, easing: Easing.in(Easing.quad) }),
                ]) as [any, ...any[]],
            );
        } else if (from === 0 && pos === 1) {
            // Leaving base: one big hop onto the start square.
            x.value = withTiming(final.x, { duration: 260, easing: Easing.inOut(Easing.quad) });
            y.value = withTiming(final.y, { duration: 260, easing: Easing.inOut(Easing.quad) });
            lift.value = withSequence(
                withTiming(1.6, { duration: 130, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }),
            );
        } else if (pos === 0 && from !== 0) {
            // Captured: wait for the attacker to land, then slide back to base.
            const ease = Easing.inOut(Easing.cubic);
            x.value = withDelay(CAPTURE_RETURN_DELAY_MS, withTiming(final.x, { duration: CAPTURE_RETURN_MS, easing: ease }));
            y.value = withDelay(CAPTURE_RETURN_DELAY_MS, withTiming(final.y, { duration: CAPTURE_RETURN_MS, easing: ease }));
        } else {
            // Same square (stack re-fan) or a resync jump.
            x.value = withTiming(final.x, { duration: 180 });
            y.value = withTiming(final.y, { duration: 180 });
        }
    }, [coord.x, coord.y, pos]);

    useEffect(() => {
        if (canMove) {
            bob.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
                ),
                -1,
            );
            ring.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1);
        } else {
            cancelAnimation(bob);
            cancelAnimation(ring);
            bob.value = withTiming(0, { duration: 120 });
            ring.value = 0;
        }
    }, [canMove]);

    useEffect(() => {
        if (captured) {
            flash.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 420 }));
        }
    }, [captured]);

    const bodyStyle = useAnimatedStyle(() => ({
        left: x.value - PAWN_W / 2,
        top: y.value + STAND_OFFSET - PAWN_H * BASE_FRAC,
        transform: [
            { translateY: -lift.value * CELL * 0.42 - bob.value * CELL * 0.24 },
            { scale: 1 + lift.value * 0.08 },
        ],
    }));
    const ringStyle = useAnimatedStyle(() => ({
        left: x.value - CELL * 0.55,
        top: y.value + STAND_OFFSET - CELL * 0.26,
        opacity: 1 - ring.value * 0.75,
        transform: [{ scaleX: 0.75 + ring.value * 0.55 }, { scaleY: 0.75 + ring.value * 0.55 }],
    }));
    const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

    // Pawns lower on the board draw over the ones behind them.
    const zIndex = Math.round(coord.y) + (canMove ? 1000 : 0);

    return (
        <>
            {canMove && (
                <Animated.View
                    pointerEvents="none"
                    style={[styles.ring, { zIndex: zIndex - 1, borderColor: COLOR_DARK[color], backgroundColor: (COLOR_HEX[color] ?? '#888') + '66' }, ringStyle]}
                />
            )}
            <Animated.View style={[styles.pawn, { zIndex }, bodyStyle]}>
                <Pressable
                    onPress={() => onPress?.(tokenIndex)}
                    disabled={!onPress || !canMove}
                    hitSlop={6}
                    style={StyleSheet.absoluteFill}
                >
                    <Pawn color={color} width={PAWN_W} />
                </Pressable>
                <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
            </Animated.View>
        </>
    );
}, sameToken);

const styles = StyleSheet.create({
    pawn: {
        position: 'absolute',
        width: PAWN_W,
        height: PAWN_H,
    },
    ring: {
        position: 'absolute',
        width: CELL * 1.1,
        height: CELL * 0.52,
        borderRadius: CELL,
        borderWidth: 3.5,
    },
    flash: {
        position: 'absolute',
        left: PAWN_W * 0.25,
        top: PAWN_H * 0.07,
        width: PAWN_W * 0.5,
        height: PAWN_W * 0.5,
        borderRadius: PAWN_W,
        backgroundColor: '#FFFFFF',
    },
});
