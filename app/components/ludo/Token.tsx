import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

import { CELL, COLOR_BRIGHT, COLOR_DARK, COLOR_HEX } from './geometry';

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

export function Token({
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

const styles = StyleSheet.create({
    captureFlash: {
        borderRadius: 100,
        backgroundColor: '#FFFFFF',
    },
});
