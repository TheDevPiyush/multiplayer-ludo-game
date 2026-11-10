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
import { Pawn } from '@/components/cosmetics/PawnArt';

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

export { Pawn } from '@/components/cosmetics/PawnArt';

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
    /** The owner's equipped pawn item. */
    skin?: string | null;
};

/** Re-render only when something visible changed (`coord` is a new object on every room update). */
function sameToken(a: TokenProps, b: TokenProps): boolean {
    return a.coord.x === b.coord.x && a.coord.y === b.coord.y && a.pos === b.pos && a.color === b.color
        && a.tokenIndex === b.tokenIndex && a.canMove === b.canMove && a.captured === b.captured && a.onPress === b.onPress && a.turns === b.turns && a.skin === b.skin;
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
    skin,
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
                    <Pawn color={color} width={PAWN_W} skin={skin} />
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
