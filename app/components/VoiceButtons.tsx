import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, useWindowDimensions, View as RNView } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { useVoiceRoom, type AudioRoute } from '@/components/VoiceRoomProvider';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ROUTES: Record<AudioRoute, { label: string; icon: IconName }> = {
    SPEAKER_PHONE: { label: 'Loudspeaker', icon: 'volume-high' },
    EARPIECE: { label: 'Phone earpiece', icon: 'phone-in-talk' },
    BLUETOOTH: { label: 'Bluetooth', icon: 'bluetooth-audio' },
    WIRED_HEADSET: { label: 'Headphones', icon: 'headphones' },
};

function RoundButton({
    icon,
    onPress,
    tone = 'plain',
    busy,
    dot,
    label,
}: {
    icon: IconName;
    onPress: () => void;
    tone?: 'plain' | 'danger';
    busy?: boolean;
    /** Small status dot in the corner (e.g. voice reconnecting). */
    dot?: string;
    label: string;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            hitSlop={6}
            accessibilityLabel={label}
            style={({ pressed }) => [styles.btn, tone === 'danger' && styles.btnDanger, pressed && { transform: [{ scale: 0.92 }] }]}
        >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name={icon} size={21} color="#FFFFFF" />}
            {dot && <RNView style={[styles.dot, { backgroundColor: dot }]} />}
        </Pressable>
    );
}

/** Mute / unmute. Joins voice first if this player isn't in it yet. */
export function MicButton({ roomId }: { roomId: string }) {
    const voice = useVoiceRoom();
    const [joining, setJoining] = useState(false);

    if (voice.micPermission === 'denied') {
        return <RoundButton icon="microphone-off" tone="danger" label="Microphone blocked — open settings" onPress={() => void Linking.openSettings()} />;
    }
    if (!voice.inRoom) {
        return (
            <RoundButton
                icon="microphone-off"
                label="Join voice"
                busy={joining}
                onPress={async () => {
                    setJoining(true);
                    try {
                        await voice.join(roomId);
                    } finally {
                        setJoining(false);
                    }
                }}
            />
        );
    }
    const reconnecting = !voice.allPeersConnected && voice.peers.length > 0;
    return (
        <RoundButton
            icon={voice.isMuted ? 'microphone-off' : 'microphone'}
            tone={voice.isMuted ? 'danger' : 'plain'}
            label={voice.isMuted ? 'Unmute' : 'Mute'}
            dot={reconnecting ? '#FFC83D' : undefined}
            onPress={voice.toggleMute}
        />
    );
}

/** Shows where voice plays; tap for a small menu of the outputs available right now. */
export function AudioOutputButton() {
    const voice = useVoiceRoom();
    const { width } = useWindowDimensions();
    const anchor = useRef<RNView>(null);
    const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);

    if (!voice.inRoom) return null;

    const routes = voice.availableRoutes.length > 0 ? voice.availableRoutes : (['SPEAKER_PHONE', 'EARPIECE'] as AudioRoute[]);
    const current = ROUTES[voice.audioRoute] ?? ROUTES.SPEAKER_PHONE;

    const open = () =>
        anchor.current?.measureInWindow((x, y, w, h) => setMenu({ top: y + h + 8, right: Math.max(12, width - (x + w)) }));

    return (
        <RNView ref={anchor} collapsable={false}>
            <RoundButton icon={current.icon} label={`Audio output: ${current.label}`} onPress={open} />
            <Modal visible={!!menu} transparent animationType="none" onRequestClose={() => setMenu(null)} statusBarTranslucent>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)}>
                    <Animated.View entering={FadeIn.duration(120)} style={styles.scrim} />
                </Pressable>
                {menu && (
                    <Animated.View entering={ZoomIn.duration(160)} style={[styles.menu, { top: menu.top, right: menu.right }]}>
                        <Text weight="bold" style={styles.menuTitle}>Audio output</Text>
                        {routes.map(route => {
                            const r = ROUTES[route];
                            const active = route === voice.audioRoute;
                            return (
                                <Pressable
                                    key={route}
                                    onPress={() => {
                                        setMenu(null);
                                        void voice.setAudioRoute(route);
                                    }}
                                    style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.7 }]}
                                >
                                    <MaterialCommunityIcons name={r.icon} size={20} color={active ? '#3B3BE8' : '#5B5F86'} />
                                    <Text weight={active ? 'bold' : 'semiBold'} style={[styles.optionText, active && { color: '#3B3BE8' }]}>
                                        {r.label}
                                    </Text>
                                    {active && <MaterialCommunityIcons name="check" size={18} color="#3B3BE8" />}
                                </Pressable>
                            );
                        })}
                    </Animated.View>
                )}
            </Modal>
        </RNView>
    );
}

const styles = StyleSheet.create({
    btn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    btnDanger: { backgroundColor: '#E2364A', borderColor: 'rgba(255,255,255,0.3)' },
    dot: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 11,
        height: 11,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#4B3BF2',
    },
    scrim: { flex: 1, backgroundColor: 'rgba(10, 8, 50, 0.25)' },
    menu: {
        position: 'absolute',
        width: 220,
        padding: 8,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A0832',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    menuTitle: { fontSize: 12, color: '#7A7FA6', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 10, paddingVertical: 6 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, height: 44, borderRadius: 12 },
    optionActive: { backgroundColor: '#F1F0FF' },
    optionText: { flex: 1, fontSize: 15, color: '#1B1A4A' },
});
