import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import Colors from '@/constants/Colors';

const palette = Colors.dark;

type Props = {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    /** heavy = more opaque, best for text-heavy areas */
    intensity?: 'light' | 'medium' | 'heavy';
    /** subtle accent glow color (hex) */
    accent?: string;
};

const BG: Record<NonNullable<Props['intensity']>, string> = {
    light: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(28, 20, 58, 0.55)',
    heavy: 'rgba(20, 14, 48, 0.78)',
};

export function GlassPanel({ children, style, intensity = 'medium', accent }: Props) {
    return (
        <View style={[styles.wrap, { backgroundColor: BG[intensity] }, style]}>
            {accent ? (
                <View
                    pointerEvents="none"
                    style={[styles.accentGlow, { backgroundColor: accent }]}
                />
            ) : null}
            <View pointerEvents="none" style={styles.border} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
    },
    border: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    accentGlow: {
        position: 'absolute',
        top: -40,
        right: -30,
        width: 120,
        height: 120,
        borderRadius: 60,
        opacity: 0.18,
    },
});
