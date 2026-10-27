import { EMOTES, QUICK_REPLIES, type Reaction } from '@ludo/engine';
import { Modal, Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Text } from '@/components/Themed';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const TRACK = '#F1F0FA';

/**
 * Emotes and quick replies, one tap to send. Opens as a small panel next to
 * the button that opened it (`anchor` places it on screen).
 */
export function ReactionPicker({ visible, onClose, onPick, anchor }: {
    visible: boolean;
    onClose: () => void;
    onPick: (reaction: Reaction) => void;
    anchor: { top?: number; bottom?: number; right: number };
}) {
    const pick = (r: Reaction) => {
        onPick(r);
        onClose();
    };
    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
                <Animated.View entering={FadeIn.duration(150)} style={styles.scrim} />
            </Pressable>
            <Animated.View entering={ZoomIn.duration(180)} style={[styles.panel, anchor]}>
                <RNView style={styles.emotes}>
                    {EMOTES.map(e => (
                        <Pressable
                            key={e.id}
                            onPress={() => pick({ kind: 'emote', id: e.id })}
                            style={({ pressed }) => [styles.emote, pressed && styles.pressed]}
                            hitSlop={2}
                            accessibilityLabel={`Send ${e.id}`}
                        >
                            <Text style={styles.emoji}>{e.emoji}</Text>
                        </Pressable>
                    ))}
                </RNView>
                <Text weight="bold" style={styles.section}>Quick replies</Text>
                <RNView style={styles.quick}>
                    {QUICK_REPLIES.map(q => (
                        <Pressable
                            key={q.id}
                            onPress={() => pick({ kind: 'quick', id: q.id })}
                            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                        >
                            <Text weight="bold" style={styles.chipText}>{q.text}</Text>
                        </Pressable>
                    ))}
                </RNView>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(10, 8, 50, 0.35)' },
    panel: {
        position: 'absolute',
        width: 300,
        padding: 12,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A0640',
        shadowOpacity: 0.3,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    emotes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
    emote: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: TRACK },
    emoji: { fontSize: 26, lineHeight: 32 },
    pressed: { transform: [{ scale: 0.9 }], opacity: 0.8 },
    section: { fontSize: 11, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: TRACK },
    chipText: { fontSize: 12, color: INK },
});
