import { useEffect } from 'react';
import { StyleSheet, View as RNView, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { Dice3D } from './Dice';
import { COLOR_HEX } from './geometry';
import { Pawn } from './Token';

/** Layout for each size: the box, then the dice and the two pawns inside it. */
const SIZES = {
    /** Home's hero card. */
    medium: { box: [140, 130], dice: 62, diceAt: { right: 26, top: 6 }, back: 38, backAt: { right: 6, top: 52 }, front: 44, frontAt: { right: 70, top: 62 }, lift: 8 },
    /** The sign-in screen's logo. */
    large: { box: [200, 168], dice: 88, diceAt: { right: 56, top: 4 }, back: 50, backAt: { right: 18, top: 70 }, front: 58, frontAt: { right: 114, top: 82 }, lift: 10 },
} as const;

/** A red 3D dice and two pawns, gently floating (one shared animation, on the UI thread). */
export function FloatingDiceArt({ size = 'medium', style }: { size?: keyof typeof SIZES; style?: StyleProp<ViewStyle> }) {
    const s = SIZES[size];
    const float = useSharedValue(0);
    useEffect(() => {
        // Back and forth with no reset between loops, so the float never jumps.
        float.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, [float]);
    const diceStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -float.value * s.lift }, { rotate: `${-12 + float.value * 6}deg` }],
    }));
    const pawnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value * s.lift * 0.5 }] }));

    return (
        <RNView style={[{ width: s.box[0], height: s.box[1] }, style]} pointerEvents="none">
            <Animated.View style={[styles.abs, s.backAt, pawnStyle]}>
                <Pawn color="BLUE" width={s.back} />
            </Animated.View>
            <Animated.View style={[styles.abs, s.diceAt, diceStyle]}>
                <Dice3D value={6} size={s.dice} color={COLOR_HEX.RED!} tilt={[-28, 34, 0]} />
            </Animated.View>
            <Animated.View style={[styles.abs, s.frontAt, pawnStyle]}>
                <Pawn color="YELLOW" width={s.front} />
            </Animated.View>
        </RNView>
    );
}

const styles = StyleSheet.create({
    abs: { position: 'absolute' },
});
