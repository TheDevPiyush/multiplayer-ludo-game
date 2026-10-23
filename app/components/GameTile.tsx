import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
    /** Gradient top → bottom. */
    colors: [string, string];
    /** Colour of the 3D edge under the face. */
    edge: string;
    onPress?: () => void;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    radius?: number;
    depth?: number;
    disabled?: boolean;
};

/**
 * Chunky game-style button: gradient face sitting on a darker edge that
 * collapses when pressed. Without `onPress` it's a static card (no press
 * feedback), so buttons placed inside it get the touches and the animation.
 * Gradient is SVG, so no extra native module.
 */
export function GameTile({ colors, edge, onPress, children, style, contentStyle, radius = 24, depth = 6, disabled }: Props) {
    const press = useSharedValue(0);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const id = `g${colors[0].replace('#', '')}${colors[1].replace('#', '')}`;

    const faceStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: press.value * (depth - 1) }],
    }));

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
    };

    const interactive = !!onPress && !disabled;

    return (
        <Pressable
            onPress={onPress}
            disabled={!interactive}
            onPressIn={interactive ? () => { press.value = withTiming(1, { duration: 70 }); } : undefined}
            onPressOut={interactive ? () => { press.value = withTiming(0, { duration: 120 }); } : undefined}
            style={[{ paddingBottom: depth }, style]}
        >
            <View style={[StyleSheet.absoluteFill, { top: depth, borderRadius: radius, backgroundColor: edge }]} />
            <Animated.View style={[{ borderRadius: radius, overflow: 'hidden' }, faceStyle]} onLayout={onLayout}>
                {size.w > 0 && (
                    <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
                        <Defs>
                            <LinearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
                                <Stop offset="0" stopColor={colors[0]} />
                                <Stop offset="1" stopColor={colors[1]} />
                            </LinearGradient>
                            <LinearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
                                <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
                            </LinearGradient>
                        </Defs>
                        <Rect width={size.w} height={size.h} fill={`url(#${id})`} />
                        {/* soft top sheen */}
                        <Rect width={size.w} height={size.h} fill={`url(#${id}-sheen)`} />
                    </Svg>
                )}
                <View style={[styles.innerBorder, { borderRadius: radius }]} pointerEvents="none" />
                <View style={contentStyle}>{children}</View>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    innerBorder: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.28)',
    },
});
