import { type ReactNode } from 'react';
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { LUDO } from '@/constants/LudoColors';

const { width: W, height: H } = Dimensions.get('window');

type Props = {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    variant?: 'default' | 'subtle';
};

type BloomSpec = {
    id: string;
    cx: number;
    cy: number;
    r: number;
    color: string;
    peak: number;
};

const BLOOMS: BloomSpec[] = [];

function bloom(id: string, cx: number, cy: number, r: number, color: string, peak: number): BloomSpec {
    return { id, cx, cy, r, color, peak };
}

/**
 * Liquid-flow background: soft radial blooms + frosted scrim for readability.
 */
export function LudoBackground({ children, style, variant = 'default' }: Props) {
    const peak = variant === 'subtle' ? 0.22 : 0.32;
    const scale = variant === 'subtle' ? 0.85 : 1;

    const blooms: BloomSpec[] = [
        bloom('bR', -W * 0.05, H * 0.02, W * 0.72 * scale, LUDO.red, peak),
        bloom('bB', W * 1.05, H * 0.12, W * 0.65 * scale, LUDO.blue, peak * 0.9),
        bloom('bG', -W * 0.08, H * 0.88, W * 0.7 * scale, LUDO.green, peak * 0.85),
        bloom('bY', W * 0.95, H * 0.92, W * 0.6 * scale, LUDO.yellow, peak * 0.75),
        bloom('bM', W * 0.5, H * 0.48, W * 0.55 * scale, '#7B5CF0', peak * 0.4),
    ];

    return (
        <View style={[styles.root, style]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1048' }]} />

            <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                    {blooms.map(b => (
                        <RadialGradient
                            key={b.id}
                            id={b.id}
                            cx="50%"
                            cy="50%"
                            rx="50%"
                            ry="50%"
                        >
                            <Stop offset="0%" stopColor={b.color} stopOpacity={b.peak} />
                            <Stop offset="55%" stopColor={b.color} stopOpacity={b.peak * 0.35} />
                            <Stop offset="100%" stopColor={b.color} stopOpacity={0} />
                        </RadialGradient>
                    ))}
                </Defs>
                {blooms.map(b => (
                    <Circle key={`c-${b.id}`} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${b.id})`} />
                ))}
            </Svg>

            <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(45, 28, 90, 0.35)' }]}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frostScrim]} />

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#1A1048',
        overflow: 'hidden',
    },
    frostScrim: {
        backgroundColor: 'rgba(12, 8, 32, 0.48)',
    },
});
