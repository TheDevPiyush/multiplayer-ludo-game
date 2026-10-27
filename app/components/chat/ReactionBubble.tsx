import { StyleSheet, View as RNView, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import type { Bubble } from '@/hooks/useRoomChat';

const INK = '#1B1A4A';

/**
 * An emote or a line of text popping over a player's seat. Place it inside the
 * seat's wrapper: it centres itself and sits just above or below the seat, or
 * over its top edge (`over`, for seats with no room above them).
 */
export function ReactionBubble({ bubble, placement = 'above', style }: {
    bubble: Bubble | undefined;
    placement?: 'above' | 'below' | 'over';
    style?: StyleProp<ViewStyle>;
}) {
    const below = placement === 'below';
    const anchor = below ? styles.anchorBelow : placement === 'over' ? styles.anchorOver : styles.anchorAbove;
    return (
        // The anchor stays mounted so a bubble can fade out when it ends.
        <RNView pointerEvents="none" style={[styles.anchor, anchor, style]}>
            {bubble && (
                <Animated.View
                    key={bubble.key}
                    entering={ZoomIn.springify().damping(12).stiffness(220)}
                    exiting={FadeOut.duration(180)}
                    style={styles.wrap}
                >
                    {below && <RNView style={[styles.tail, styles.tailUp]} />}
                    {bubble.emoji ? (
                        <RNView style={styles.emojiBubble}>
                            <Text style={styles.emoji}>{bubble.emoji}</Text>
                        </RNView>
                    ) : (
                        <RNView style={styles.textBubble}>
                            <Text weight="bold" style={styles.text} numberOfLines={3}>{bubble.text}</Text>
                        </RNView>
                    )}
                    {!below && <RNView style={[styles.tail, styles.tailDown]} />}
                </Animated.View>
            )}
        </RNView>
    );
}

const styles = StyleSheet.create({
    anchor: { position: 'absolute', left: -20, right: -20, alignItems: 'center', zIndex: 50, elevation: 50 },
    anchorAbove: { bottom: '100%', marginBottom: 2 },
    anchorBelow: { top: '100%', marginTop: 2 },
    anchorOver: { top: -40 },
    wrap: { alignItems: 'center' },
    emojiBubble: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A0640',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    emoji: { fontSize: 32, lineHeight: 40 },
    textBubble: {
        maxWidth: 180,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A0640',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    text: { fontSize: 13, lineHeight: 17, color: INK, textAlign: 'center' },
    tail: {
        width: 0,
        height: 0,
        borderLeftWidth: 7,
        borderRightWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
    },
    tailDown: { borderTopWidth: 8, borderTopColor: '#FFFFFF', marginTop: -1 },
    tailUp: { borderBottomWidth: 8, borderBottomColor: '#FFFFFF', marginBottom: -1 },
});
