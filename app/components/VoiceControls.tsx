import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import {
    useVoiceRoom,
    type AudioRoute,
    AUDIO_ROUTE_LABELS,
    AUDIO_ROUTE_ICONS,
} from '@/components/VoiceRoomProvider';

const palette = Colors.dark;

type Props = {
    roomId: string;
    compact?: boolean;
    showLeave?: boolean;
};

function routeLabel(route: AudioRoute): string {
    return AUDIO_ROUTE_LABELS[route] ?? route;
}

function routeIcon(route: AudioRoute): string {
    return AUDIO_ROUTE_ICONS[route] ?? 'volume-up';
}

export function VoiceControls({ roomId, compact, showLeave = true }: Props) {
    const voice = useVoiceRoom();
    const [joining, setJoining] = useState(false);

    const handleJoin = async () => {
        if (!roomId || joining) return;
        setJoining(true);
        try {
            await voice.join(roomId);
        } finally {
            setJoining(false);
        }
    };

    const pickRoute = () => {
        const routes = voice.availableRoutes.length > 0
            ? voice.availableRoutes
            : (['SPEAKER_PHONE', 'EARPIECE'] as AudioRoute[]);

        if (routes.length <= 1) {
            void voice.setAudioRoute(routes[0]);
            return;
        }

        if (Platform.OS === 'web') {
            void voice.setAudioRoute(routes[0]);
            return;
        }

        Alert.alert(
            'Audio output',
            'Choose where voice chat plays',
            [
                ...routes.map(route => ({
                    text: routeLabel(route),
                    onPress: () => { void voice.setAudioRoute(route); },
                })),
                { text: 'Cancel', style: 'cancel' as const },
            ],
        );
    };

    if (!voice.inRoom) {
        return (
            <TouchableOpacity
                style={[styles.joinBtn, compact && styles.joinBtnCompact]}
                onPress={() => { void handleJoin(); }}
                disabled={joining || voice.micPermission === 'denied'}
                activeOpacity={0.85}
            >
                {joining ? (
                    <ActivityIndicator size="small" color="#37BD6A" />
                ) : (
                    <FontAwesome name="microphone" size={compact ? 13 : 14} color="#37BD6A" />
                )}
                <Text weight="semiBold" style={styles.joinText}>
                    {voice.micPermission === 'denied' ? 'Mic blocked' : 'Join Voice'}
                </Text>
            </TouchableOpacity>
        );
    }

    return (
        <RNView style={styles.wrap}>
            {!voice.allPeersConnected && voice.peers.length > 0 && (
                <RNView style={styles.reconnectBanner}>
                    <RNView style={styles.reconnectDot} />
                    <Text weight="medium" style={styles.reconnectText}>Reconnecting voice…</Text>
                </RNView>
            )}
            <RNView style={[styles.row, compact && styles.rowCompact]}>
            <TouchableOpacity
                style={[styles.chip, voice.isMuted && styles.chipMuted]}
                onPress={voice.toggleMute}
                activeOpacity={0.8}
            >
                <FontAwesome
                    name={voice.isMuted ? 'microphone-slash' : 'microphone'}
                    size={compact ? 14 : 15}
                    color={voice.isMuted ? '#D94444' : '#37BD6A'}
                />
                {!compact && (
                    <Text weight="semiBold" style={[styles.chipText, voice.isMuted && styles.chipTextMuted]}>
                        {voice.isMuted ? 'Unmute' : 'Mute'}
                    </Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.chip}
                onPress={pickRoute}
                activeOpacity={0.8}
            >
                <FontAwesome
                    name={routeIcon(voice.audioRoute) as any}
                    size={compact ? 14 : 15}
                    color={palette.text}
                />
                {!compact && (
                    <Text weight="semiBold" style={styles.chipText} numberOfLines={1}>
                        {routeLabel(voice.audioRoute)}
                    </Text>
                )}
            </TouchableOpacity>

            {showLeave && (
                <TouchableOpacity
                    style={[styles.chip, styles.leaveChip]}
                    onPress={voice.leave}
                    activeOpacity={0.8}
                >
                    <FontAwesome
                        name="phone"
                        size={compact ? 12 : 13}
                        color="#D94444"
                        style={{ transform: [{ rotate: '135deg' }] }}
                    />
                </TouchableOpacity>
            )}
            </RNView>
        </RNView>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 6 },
    reconnectBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(232, 165, 32, 0.12)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(232, 165, 32, 0.35)',
    },
    reconnectDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#E8A520',
    },
    reconnectText: {
        fontSize: 11,
        color: '#E8A520',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    rowCompact: {
        gap: 6,
    },
    joinBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(55, 189, 106, 0.12)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(55, 189, 106, 0.35)',
        borderRadius: 14,
        paddingVertical: 12,
    },
    joinBtnCompact: {
        flex: 0,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    joinText: {
        fontSize: 13,
        color: '#37BD6A',
    },
    chip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 10,
    },
    chipMuted: {
        backgroundColor: 'rgba(217, 68, 68, 0.1)',
        borderColor: 'rgba(217, 68, 68, 0.3)',
    },
    chipText: {
        fontSize: 12,
        color: palette.text,
    },
    chipTextMuted: {
        color: '#D94444',
    },
    leaveChip: {
        flex: 0,
        width: 44,
        backgroundColor: 'rgba(217, 68, 68, 0.1)',
        borderColor: 'rgba(217, 68, 68, 0.3)',
    },
});
