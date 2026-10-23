import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect } from 'react';
import { StyleSheet, View as RNView } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { COLOR_HEX } from './geometry';

const palette = Colors.dark;

export type PlayerStripProps = {
    color: string;
    name: string;
    /** Two-letter avatar text; ignored when `avatarIcon` is set. */
    initials: string;
    avatarIcon?: React.ComponentProps<typeof FontAwesome>['name'];
    isActive: boolean;
    /** Greys out the avatar (offline / left). */
    dimmed?: boolean;
    subtitle: string;
    subtitleColor?: string;
    /** Small icon before the subtitle (e.g. microphone). */
    statusIcon?: React.ComponentProps<typeof FontAwesome>['name'];
    statusIconColor?: string;
};

export function PlayerStrip(p: PlayerStripProps) {
    const ring = useSharedValue(0);
    useEffect(() => {
        if (p.isActive) {
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
    }, [p.isActive]);

    const ringStyle = useAnimatedStyle(() => ({
        opacity: ring.value * 0.7,
        transform: [{ scale: 1 + ring.value * 0.12 }],
    }));

    const color = COLOR_HEX[p.color] ?? '#888';

    return (
        <GlassPanel
            intensity="medium"
            style={[styles.strip, p.isActive && { borderColor: color, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.16)' }]}
        >
            <RNView style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 2, borderColor: color }, ringStyle]} />
                <RNView style={[styles.avatar, { backgroundColor: color, opacity: p.dimmed ? 0.4 : 1 }]}>
                    {p.avatarIcon ? (
                        <FontAwesome name={p.avatarIcon} size={13} color="#fff" />
                    ) : (
                        <Text weight="bold" style={{ color: '#fff', fontSize: 11 }}>{p.initials}</Text>
                    )}
                </RNView>
            </RNView>
            <RNView style={{ flex: 1, gap: 2 }}>
                <Text weight="bold" style={styles.name} numberOfLines={1}>{p.name}</Text>
                <RNView style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {p.statusIcon && <FontAwesome name={p.statusIcon} size={9} color={p.statusIconColor ?? color} />}
                    <Text weight="medium" style={[styles.sub, p.subtitleColor ? { color: p.subtitleColor } : null]} numberOfLines={1}>
                        {p.subtitle}
                    </Text>
                </RNView>
            </RNView>
            {p.isActive && <RNView style={[styles.activeDot, { backgroundColor: color }]} />}
        </GlassPanel>
    );
}

const styles = StyleSheet.create({
    strip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    avatar: {
        width: 30, height: 30,
        borderRadius: 15,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    },
    name: { fontSize: 12, color: palette.text },
    sub: { fontSize: 10, color: palette.mutedText, letterSpacing: 0.4, textTransform: 'capitalize' },
    activeDot: { width: 8, height: 8, borderRadius: 4 },
});
