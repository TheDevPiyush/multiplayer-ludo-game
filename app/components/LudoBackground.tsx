import { type ReactNode } from 'react';
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

type Props = {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    variant?: 'default' | 'subtle';
};

export const BG_TOP = '#2F5BFF';
export const BG_MID = '#4B3BF2';
export const BG_BOTTOM = '#6A2BD8';

/** Faint dice-pip texture so the gradient doesn't read as a flat template. */
const PIPS: { x: number; y: number; s: number; r: number }[] = (() => {
    const out: { x: number; y: number; s: number; r: number }[] = [];
    const cols = 5;
    const rows = Math.ceil(H / (W / cols)) + 1;
    const step = W / cols;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols + 1; col++) {
            const x = col * step + (row % 2 ? step / 2 : 0);
            const y = row * step;
            // Deterministic variety without randomness between renders.
            const s = step * (0.22 + ((row * 7 + col * 3) % 5) * 0.03);
            const r = ((row * 31 + col * 17) % 40) - 20;
            out.push({ x, y, s, r });
        }
    }
    return out;
})();

/** Vivid royal-blue → violet backdrop shared by every screen. */
export function LudoBackground({ children, style, variant = 'default' }: Props) {
    const texture = variant === 'subtle' ? 0.035 : 0.05;

    return (
        <View style={[styles.root, style]}>
            <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                    <LinearGradient id="bgGrad" x1="0" y1="0" x2="0.35" y2="1">
                        <Stop offset="0" stopColor={BG_TOP} />
                        <Stop offset="0.55" stopColor={BG_MID} />
                        <Stop offset="1" stopColor={BG_BOTTOM} />
                    </LinearGradient>
                    <RadialGradient id="glowTop" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor="#7FD3FF" stopOpacity={0.45} />
                        <Stop offset="1" stopColor="#7FD3FF" stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="glowBottom" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor="#FF5FD2" stopOpacity={0.3} />
                        <Stop offset="1" stopColor="#FF5FD2" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Rect width={W} height={H} fill="url(#bgGrad)" />
                <Circle cx={W * 0.15} cy={-H * 0.02} r={W * 0.85} fill="url(#glowTop)" />
                <Circle cx={W * 1.05} cy={H * 0.95} r={W * 0.9} fill="url(#glowBottom)" />
                <G opacity={texture}>
                    {PIPS.map((p, i) => (
                        <Rect
                            key={i}
                            x={p.x - p.s / 2}
                            y={p.y - p.s / 2}
                            width={p.s}
                            height={p.s}
                            rx={p.s * 0.28}
                            fill="#FFFFFF"
                            transform={`rotate(${p.r} ${p.x} ${p.y})`}
                        />
                    ))}
                </G>
            </Svg>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG_MID,
        overflow: 'hidden',
    },
});
