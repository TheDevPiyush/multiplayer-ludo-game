import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { COLORS, pickColor, type Color, type ColorSeat } from '@ludo/engine';
import { memo, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { COLOR_BRIGHT, COLOR_DARK, COLOR_HEX } from './geometry';

export type ColorOption = {
    color: Color;
    /**
     * `taken`: held by someone else, so it can't be picked.
     * `swap`: held by another seat on this device; picking it swaps the two.
     */
    status: 'mine' | 'free' | 'taken' | 'swap';
    /** Who holds it (shown under taken colors). */
    holder?: string;
};

const titleCase = (c: string) => c[0] + c.slice(1).toLowerCase();

/**
 * What `myId` may pick, by the same rules the server enforces (`pickColor` in
 * @ludo/engine), so the picker never offers a color the server would refuse.
 */
export function colorOptions(
    maxPlayers: number,
    seats: (ColorSeat & { label?: string })[],
    myId: string,
): ColorOption[] {
    return COLORS.map(color => {
        const holder = seats.find(s => s.color === color);
        if (holder?.id === myId) return { color, status: 'mine' };
        if (pickColor(maxPlayers, seats, myId, color) === null) return { color, status: 'taken', holder: holder?.label };
        return { color, status: 'free' };
    });
}

const Dot = memo(function Dot({ option, size, pending, disabled, showLabel, onPick }: {
    option: ColorOption;
    size: number;
    pending: boolean;
    disabled: boolean;
    showLabel: boolean;
    onPick: (color: Color) => void;
}) {
    const { color, status } = option;
    const mine = status === 'mine';
    const scale = useSharedValue(mine ? 1.1 : 1);
    useEffect(() => {
        scale.value = withSpring(mine ? 1.1 : 1, { damping: 12, stiffness: 220 });
    }, [mine, scale]);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const pickable = status === 'free' || status === 'swap';
    const label = mine ? 'You' : status === 'free' ? 'Free' : (option.holder ?? 'Taken');
    const spoken = mine ? 'your color' : status === 'taken' ? `taken by ${label}` : status === 'swap' ? `swap with ${label}` : 'free';
    return (
        <Pressable
            onPress={() => onPick(color)}
            disabled={disabled || !pickable}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${titleCase(color)}, ${spoken}`}
            accessibilityState={{ selected: mine, disabled: disabled || !pickable }}
            style={({ pressed }) => [styles.option, pressed && pickable && { transform: [{ scale: 0.92 }] }]}
        >
            <Animated.View
                style={[
                    styles.ring,
                    { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 },
                    mine && styles.ringMine,
                    style,
                ]}
            >
                <RNView
                    style={[
                        styles.dot,
                        {
                            width: size, height: size, borderRadius: size / 2,
                            backgroundColor: COLOR_HEX[color],
                            borderColor: COLOR_DARK[color],
                            borderTopColor: COLOR_BRIGHT[color],
                        },
                        status === 'taken' && styles.dotTaken,
                        status === 'swap' && styles.dotSwap,
                    ]}
                >
                    {pending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : mine ? (
                        <MaterialCommunityIcons name="check-bold" size={size * 0.45} color="#FFFFFF" />
                    ) : status === 'taken' ? (
                        <MaterialCommunityIcons name="lock" size={size * 0.38} color="#FFFFFF" />
                    ) : status === 'swap' ? (
                        <MaterialCommunityIcons name="swap-horizontal" size={size * 0.5} color="#FFFFFF" />
                    ) : null}
                </RNView>
            </Animated.View>
            {showLabel && (
                <Text weight={mine ? 'bold' : 'medium'} numberOfLines={1} style={[styles.label, status === 'taken' && styles.labelTaken]}>
                    {label}
                </Text>
            )}
        </Pressable>
    );
});

/** The four colors as tappable dots: yours (check), free, taken (lock + who has it) or swappable. */
export function ColorPicker({ options, onPick, pending = null, disabled = false, size = 44, showLabels = true }: {
    options: ColorOption[];
    onPick: (color: Color) => void;
    /** Color being requested right now (shows a spinner; other taps wait). */
    pending?: Color | null;
    disabled?: boolean;
    size?: number;
    showLabels?: boolean;
}) {
    return (
        <RNView style={styles.row}>
            {options.map(o => (
                <Dot
                    key={o.color}
                    option={o}
                    size={size}
                    pending={pending === o.color}
                    disabled={disabled || pending !== null}
                    showLabel={showLabels}
                    onPick={onPick}
                />
            ))}
        </RNView>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    option: { flex: 1, alignItems: 'center', gap: 6 },
    ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
    ringMine: { borderColor: '#FFFFFF' },
    dot: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
    dotTaken: { opacity: 0.4 },
    dotSwap: { opacity: 0.55 },
    label: { fontSize: 12, color: '#FFFFFF', maxWidth: 80 },
    labelTaken: { color: 'rgba(255,255,255,0.6)' },
});
