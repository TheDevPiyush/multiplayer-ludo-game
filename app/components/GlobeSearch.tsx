import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { COLOR_HEX } from '@/components/ludo/geometry';

/** Stylised land for one turn of the globe, in a 400×200 box (half of it faces you at a time). */
const LAND = [
    'M40,40 C60,25 105,28 120,45 C128,58 112,70 100,78 C92,86 86,98 78,104 C70,96 58,84 48,80 C36,72 30,55 40,40 Z',
    'M86,112 C98,108 110,118 108,134 C106,150 96,168 88,178 C82,168 80,150 78,136 C76,124 78,114 86,112 Z',
    'M136,24 C146,20 156,24 154,32 C150,38 140,38 136,32 Z',
    'M180,40 C192,32 214,34 222,44 C226,52 216,58 206,60 C196,62 186,58 180,52 Z',
    'M186,72 C204,64 230,70 236,88 C240,104 230,122 222,140 C216,154 206,160 200,150 C194,136 192,120 186,108 C180,96 176,80 186,72 Z',
    'M232,36 C262,24 314,28 346,40 C362,48 360,62 344,70 C326,78 312,90 296,96 C282,100 270,92 262,84 C250,74 236,64 230,52 C228,44 228,40 232,36 Z',
    'M276,96 C284,96 290,104 286,116 C282,124 276,120 274,112 Z',
    'M318,132 C334,124 356,128 362,140 C366,152 352,160 336,158 C322,156 312,146 318,132 Z',
];

const OCEAN = '#2E86FF';
const LAND_FILL = '#3DDC84';
const SPIN_MS = 14_000;
const PING_MS = 2_200;
const ORBIT_MS = 5_200;
/** Players "flying in": one dot per colour, spread around the orbit. */
const ORBITERS = [
    { color: COLOR_HEX.RED!, phase: 0 },
    { color: COLOR_HEX.YELLOW!, phase: 0.36 },
    { color: COLOR_HEX.GREEN!, phase: 0.68 },
];

function Land({ size }: { size: number }) {
    return (
        <Svg width={size * 2} height={size} viewBox="0 0 400 200">
            {LAND.map((d, i) => <Path key={i} d={d} fill={LAND_FILL} />)}
        </Svg>
    );
}

function Ping({ size, delay, on }: { size: number; delay: number; on: boolean }) {
    const t = useSharedValue(0);
    useEffect(() => {
        if (!on) {
            cancelAnimation(t);
            t.value = withTiming(0, { duration: 200 });
            return;
        }
        t.value = 0;
        t.value = withDelay(delay, withRepeat(withTiming(1, { duration: PING_MS, easing: Easing.out(Easing.quad) }), -1));
    }, [on, delay, t]);
    const style = useAnimatedStyle(() => ({
        opacity: t.value === 0 ? 0 : 0.7 * (1 - t.value),
        transform: [{ scale: 1 + t.value * 0.75 }],
    }));
    return <Animated.View style={[styles.ping, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

/** A dot on a flat orbit. Each is drawn twice: the far half under the globe (so it hides it), the near half over it. */
function Orbiter({ orbit, phase, color, size, on, front }: {
    orbit: SharedValue<number>;
    phase: number;
    color: string;
    size: number;
    on: boolean;
    front: boolean;
}) {
    const rx = size * 0.78;
    const ry = size * 0.26;
    const dot = Math.max(8, size * 0.13);
    const style = useAnimatedStyle(() => {
        const a = (orbit.value + phase) * Math.PI * 2;
        const near = Math.sin(a) >= 0;
        return {
            opacity: on && near === front ? 1 : 0,
            transform: [{ translateX: Math.cos(a) * rx }, { translateY: Math.sin(a) * ry }, { scale: 0.75 + 0.25 * Math.sin(a) }],
        };
    });
    return (
        <Animated.View
            style={[styles.orbiter, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color, marginLeft: -dot / 2, marginTop: -dot / 2 }, style]}
        />
    );
}

/**
 * A spinning globe with radar pings and players orbiting it, for public lobbies
 * looking for players. `searching` off: it keeps spinning, without the pings and orbit.
 */
export function GlobeSearch({ size = 84, searching = true }: { size?: number; searching?: boolean }) {
    const spin = useSharedValue(0);
    const orbit = useSharedValue(0);
    useEffect(() => {
        spin.value = withRepeat(withTiming(1, { duration: SPIN_MS, easing: Easing.linear }), -1);
        orbit.value = withRepeat(withTiming(1, { duration: ORBIT_MS, easing: Easing.linear }), -1);
    }, [spin, orbit]);
    // Two copies of the land side by side: after one full turn the second is exactly where the first began.
    const landStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -spin.value * size * 2 }] }));
    const box = size * 1.8;

    return (
        <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <Ping size={size} delay={0} on={searching} />
            <Ping size={size} delay={PING_MS / 2} on={searching} />
            <View style={[styles.tilt, { width: box, height: box }]}>
                {ORBITERS.map(o => <Orbiter key={o.color} orbit={orbit} phase={o.phase} color={o.color} size={size} on={searching} front={false} />)}
            </View>
            <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: OCEAN }}>
                <Animated.View style={[{ flexDirection: 'row', width: size * 4, height: size }, landStyle]}>
                    <Land size={size} />
                    <Land size={size} />
                </Animated.View>
                {/* Light from the top left, dark towards the rim: reads as a sphere. */}
                <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                    <Defs>
                        <RadialGradient id="globe-shade" cx="50%" cy="50%" r="50%" fx="34%" fy="28%">
                            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
                            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
                            <Stop offset="0.85" stopColor="#0A0830" stopOpacity={0.25} />
                            <Stop offset="1" stopColor="#0A0830" stopOpacity={0.55} />
                        </RadialGradient>
                    </Defs>
                    <Rect width={size} height={size} fill="url(#globe-shade)" />
                </Svg>
            </View>
            <View style={[styles.tilt, { width: box, height: box }]}>
                {ORBITERS.map(o => <Orbiter key={o.color} orbit={orbit} phase={o.phase} color={o.color} size={size} on={searching} front />)}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    ping: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
    tilt: { position: 'absolute', transform: [{ rotate: '-16deg' }] },
    orbiter: { position: 'absolute', left: '50%', top: '50%', borderWidth: 2, borderColor: '#FFFFFF' },
});
