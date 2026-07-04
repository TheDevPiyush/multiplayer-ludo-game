import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import { VoiceControls } from '@/components/VoiceControls';
import Colors from '@/constants/Colors';
import { LUDO } from '@/constants/LudoColors';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom, type RoomPlayer } from '@/hooks/useGameRoom';
import { useSocket } from '@/components/SocketProvider';
import { useVoiceRoom } from '@/components/VoiceRoomProvider';
import { supabase } from '@/util/supabase-client';
import { setActiveRoom } from '@/util/active-room';

const palette = Colors.dark;

const COLOR_HEX: Record<string, string> = {
    RED: LUDO.red,
    BLUE: LUDO.blue,
    GREEN: LUDO.green,
    YELLOW: LUDO.yellow,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function WaitingDot({ delay }: { delay: number }) {
    const anim = useRef(new Animated.Value(0.25)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 480, delay, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.25, duration: 480, useNativeDriver: true }),
            ]),
        ).start();
    }, [anim, delay]);
    return <Animated.View style={[styles.waitDot, { opacity: anim }]} />;
}

type SlotData = RoomPlayer & { isHost: boolean; isOnline: boolean; inVoice: boolean; voiceMuted: boolean };

function PlayerCard({
    player,
    index,
    onMicTap,
}: {
    player: SlotData | null;
    index: number;
    onMicTap?: () => void;
}) {
    const enter = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(enter, {
            toValue: 1,
            duration: 400,
            delay: index * 70,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [enter, index]);

    useEffect(() => {
        if (player?.inVoice && !player.voiceMuted) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
                ]),
            ).start();
        } else {
            pulse.stopAnimation();
            pulse.setValue(0);
        }
    }, [player?.inVoice, player?.voiceMuted, pulse]);

    if (!player) {
        return (
            <Animated.View style={[styles.cardWrap, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                <GlassPanel intensity="light" style={styles.emptyCard}>
                    <RNView style={styles.emptyAvatar}>
                        <FontAwesome name="plus" size={16} color={palette.dimText} />
                    </RNView>
                    <Text weight="medium" style={styles.emptyLabel}>Open slot</Text>
                    <RNView style={styles.emptyDots}>
                        {[0, 1, 2].map(i => <WaitingDot key={i} delay={i * 160} />)}
                    </RNView>
                </GlassPanel>
            </Animated.View>
        );
    }

    const color = COLOR_HEX[player.color] ?? LUDO.blue;
    const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
    const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

    return (
        <Animated.View style={[styles.cardWrap, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
            <GlassPanel intensity="medium" accent={color} style={styles.playerCard}>
                <RNView style={[styles.colorBar, { backgroundColor: color }]} />

                <RNView style={styles.avatarWrap}>
                    {player.inVoice && !player.voiceMuted && (
                        <Animated.View
                            style={[styles.voiceRing, { borderColor: color, transform: [{ scale: ringScale }], opacity: ringOpacity }]}
                        />
                    )}
                    <RNView style={[styles.avatar, { backgroundColor: color, opacity: player.isOnline ? 1 : 0.45 }]}>
                        <Text weight="bold" style={styles.avatarText}>
                            {player.user.username.slice(0, 2).toUpperCase()}
                        </Text>
                    </RNView>
                    {!player.isOnline && <RNView style={styles.offlineDot} />}
                </RNView>

                <Text weight="bold" style={styles.playerName} numberOfLines={1}>
                    {player.user.username}
                </Text>

                <RNView style={styles.badgeRow}>
                    <RNView style={[styles.colorPill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                        <RNView style={[styles.colorDot, { backgroundColor: color }]} />
                        <Text weight="semiBold" style={[styles.colorPillText, { color }]}>{player.color}</Text>
                    </RNView>
                    {player.isHost && (
                        <RNView style={styles.hostPill}>
                            <FontAwesome name="star" size={8} color={LUDO.yellow} />
                            <Text weight="bold" style={styles.hostText}>HOST</Text>
                        </RNView>
                    )}
                </RNView>

                <TouchableOpacity
                    onPress={onMicTap}
                    disabled={!onMicTap}
                    activeOpacity={0.75}
                    style={[
                        styles.voiceChip,
                        {
                            backgroundColor: player.inVoice ? color + '18' : 'rgba(255,255,255,0.06)',
                            borderColor: player.inVoice ? color + '44' : palette.glassBorder,
                        },
                    ]}
                >
                    <FontAwesome
                        name={!player.inVoice || player.voiceMuted ? 'microphone-slash' : 'microphone'}
                        size={10}
                        color={player.inVoice && !player.voiceMuted ? color : palette.mutedText}
                    />
                    <Text
                        weight="semiBold"
                        style={[styles.voiceChipText, { color: player.inVoice && !player.voiceMuted ? color : palette.mutedText }]}
                    >
                        {!player.inVoice ? 'Voice off' : player.voiceMuted ? 'Muted' : 'Live'}
                    </Text>
                </TouchableOpacity>
            </GlassPanel>
        </Animated.View>
    );
}

function connectionLabel(phase: string): string {
    if (phase === 'connected') return 'Connected';
    if (phase === 'offline') return 'Offline';
    if (phase === 'reconnecting') return 'Reconnecting…';
    return 'Connecting…';
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LobbyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const { connectionPhase, isRealtimeReady } = useSocket();

    const { gameCode: rawGameCode, maxPlayers_: maxPlayersParam, roomId: rawRoomId } =
        useLocalSearchParams<{
            gameCode?: string | string[];
            maxPlayers_?: string;
            roomId?: string | string[];
        }>();

    const roomCode = typeof rawGameCode === 'string' ? rawGameCode.trim() : String(rawGameCode?.[0] ?? '').trim();
    const roomId = typeof rawRoomId === 'string' ? rawRoomId.trim() : String(rawRoomId?.[0] ?? '').trim();
    const maxPlayers = Number(maxPlayersParam) || 4;

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [dialog, setDialog] = useState({
        visible: false,
        title: '',
        message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const serverLeaveDoneRef = useRef(false);
    const voiceSyncedRef = useRef(false);
    const heroScale = useRef(new Animated.Value(0.96)).current;
    const heroFade = useRef(new Animated.Value(0)).current;

    const { room, onlineUserIds, voicePeers, joinError } = useGameRoom({ roomId, gameCode: roomCode });
    const { startGame } = useGameActions(roomCode);
    const voice = useVoiceRoom();

    const players = room?.players ?? [];
    const selfPlayer = players.find(p => p.userId === currentUserId);
    const isHost = !!room && !!selfPlayer && selfPlayer.userId === room.createdById;
    const isFull = players.length === maxPlayers;
    const canStart = players.length >= 2;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }),
            Animated.timing(heroFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, [heroFade, heroScale]);

    useEffect(() => {
        if (roomId && roomCode) {
            void setActiveRoom({ roomId, gameCode: roomCode, maxPlayers, screen: 'lobby' });
        }
    }, [roomId, roomCode, maxPlayers]);

    useEffect(() => {
        if (room?.status === 'PLAYING') {
            void setActiveRoom({ roomId, gameCode: roomCode, maxPlayers, screen: 'board' });
            serverLeaveDoneRef.current = true;
            router.replace({ pathname: '/(game)/board', params: { gameCode: roomCode, roomId } });
        }
        if (room?.status === 'CANCELLED') {
            showError('Room Cancelled', 'The host cancelled the room.');
            setTimeout(() => {
                void setActiveRoom(null);
                serverLeaveDoneRef.current = true;
                router.replace('/(tabs)');
            }, 1800);
        }
    }, [room?.status, roomCode, roomId, maxPlayers, router]);

    const hideDialog = () => setDialog(p => ({ ...p, visible: false }));
    const showError = useCallback((title: string, message: string) => {
        setDialog({ visible: true, title, message, actions: undefined });
    }, []);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }, []);

    useEffect(() => {
        if (joinError) showError('Could not join', joinError);
    }, [joinError, showError]);

    // Voice: wait for socket room join, then join or resync voice
    useEffect(() => {
        voiceSyncedRef.current = false;
    }, [roomId]);

    useEffect(() => {
        if (!room?.voiceEnabled || !roomId || !isRealtimeReady) return;
        if (voiceSyncedRef.current) return;
        voiceSyncedRef.current = true;

        if (voice.inRoom && voice.roomId === roomId) {
            voice.resync();
        } else {
            void voice.join(roomId);
        }
    }, [room?.voiceEnabled, roomId, isRealtimeReady, voice.inRoom, voice.roomId, voice.join, voice.resync]);

    async function notifyServerLeave() {
        if (!roomCode) return { ok: true as const };
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return { ok: false as const, error: 'Not signed in.' };
        return leaveRoom(token, roomCode);
    }

    function openLeaveDialog() {
        setDialog({
            visible: true,
            title: 'Leave Room',
            message: isHost
                ? 'You are the host. Leaving will cancel the room for everyone.'
                : 'Are you sure you want to leave?',
            actions: [
                { label: 'Cancel', onPress: hideDialog },
                {
                    label: 'Leave',
                    onPress: () => {
                        void (async () => {
                            const result = await notifyServerLeave();
                            if (!result.ok) {
                                hideDialog();
                                showError('Could not leave', (result as { error: string }).error);
                                return;
                            }
                            voice.leave();
                            await setActiveRoom(null);
                            serverLeaveDoneRef.current = true;
                            hideDialog();
                            router.back();
                        })();
                    },
                },
            ],
        });
    }

    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (serverLeaveDoneRef.current) { serverLeaveDoneRef.current = false; return; }
            if (!roomCode) return;
            e.preventDefault();
            void (async () => {
                const result = await notifyServerLeave();
                if (!result.ok) { showError('Could not leave', (result as { error: string }).error); return; }
                voice.leave();
                await setActiveRoom(null);
                serverLeaveDoneRef.current = true;
                navigation.dispatch(e.data.action);
            })();
        });
        return unsub;
    }, [navigation, roomCode, showError, voice]);

    const handleStart = async () => {
        if (!canStart) { showError('Not enough players', 'Need at least 2 players to start.'); return; }
        if (!isRealtimeReady) { showError('Not connected', 'Waiting for server connection…'); return; }
        try {
            setStarting(true);
            const result = await startGame();
            if (!result.ok) showError('Could not start', result.error);
        } catch {
            showError('Error', 'Something went wrong.');
        } finally {
            setStarting(false);
        }
    };

    const copyCode = async () => {
        await Clipboard.setStringAsync(roomCode);
        setDialog({ visible: true, title: 'Copied!', message: `Room code ${roomCode} copied to clipboard.`, actions: undefined });
    };

    const slotData = useMemo<SlotData[]>(() => {
        if (!room) return [];
        return players.map(p => {
            const inVoice = voicePeers.includes(p.userId) || (p.userId === currentUserId && voice.inRoom);
            const isMe = p.userId === currentUserId;
            const voiceMuted = isMe ? voice.isMuted : (voice.peers.find(vp => vp.userId === p.userId)?.muted ?? false);
            return {
                ...p,
                isHost: p.userId === room.createdById,
                isOnline: onlineUserIds.includes(p.userId) || isMe,
                inVoice,
                voiceMuted,
            };
        });
    }, [room, players, voicePeers, voice.peers, voice.isMuted, voice.inRoom, onlineUserIds, currentUserId]);

    const slots = useMemo<(SlotData | null)[]>(
        () => Array.from({ length: maxPlayers }, (_, i) => slotData[i] ?? null),
        [slotData, maxPlayers],
    );

    const connColor = connectionPhase === 'connected' ? LUDO.green : connectionPhase === 'offline' ? LUDO.red : LUDO.yellow;

    return (
        <RNView style={styles.screen}>
            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <RNView style={styles.topBar}>
                    <TouchableOpacity onPress={openLeaveDialog} style={styles.iconBtn} activeOpacity={0.7}>
                        <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                    </TouchableOpacity>
                    <RNView style={styles.topCenter}>
                        <Text weight="bold" style={styles.topTitle}>Lobby</Text>
                        <RNView style={styles.connRow}>
                            <RNView style={[styles.connDot, { backgroundColor: connColor }]} />
                            <Text weight="medium" style={styles.connText}>{connectionLabel(connectionPhase)}</Text>
                        </RNView>
                    </RNView>
                    <RNView style={styles.iconBtnPlaceholder} />
                </RNView>

                {/* Room code hero */}
                <Animated.View style={{ opacity: heroFade, transform: [{ scale: heroScale }] }}>
                    <GlassPanel intensity="heavy" accent={LUDO.red} style={styles.codeHero}>
                        <Text weight="medium" style={styles.codeLabel}>ROOM CODE</Text>
                        <TouchableOpacity onPress={copyCode} activeOpacity={0.85} style={styles.codeTap}>
                            <Text weight="bold" style={styles.codeValue}>{roomCode || '——'}</Text>
                            <RNView style={styles.copyBadge}>
                                <FontAwesome name="copy" size={11} color={palette.text} />
                            </RNView>
                        </TouchableOpacity>
                        <Text weight="medium" style={styles.codeHint}>Tap to copy · share with friends</Text>

                        <RNView style={styles.progressTrack}>
                            <RNView style={[styles.progressFill, { width: `${(players.length / maxPlayers) * 100}%` as `${number}%` }]} />
                        </RNView>
                        <Text weight="semiBold" style={styles.playerCount}>
                            {players.length} / {maxPlayers} players
                        </Text>
                    </GlassPanel>
                </Animated.View>

                {/* Player grid */}
                <RNView style={[styles.grid, maxPlayers === 2 && styles.gridTwo]}>
                    {slots.map((player, i) => (
                        <PlayerCard
                            key={player?.id ?? `empty-${i}`}
                            player={player}
                            index={i}
                            onMicTap={
                                player && player.userId === currentUserId && voice.inRoom
                                    ? voice.toggleMute
                                    : undefined
                            }
                        />
                    ))}
                </RNView>

                {/* Status */}
                <RNView style={styles.statusWrap}>
                    <Text weight="medium" style={styles.statusText}>
                        {isFull
                            ? 'Everyone is here — ready to roll!'
                            : `Waiting for ${maxPlayers - players.length} more player${maxPlayers - players.length > 1 ? 's' : ''}…`}
                    </Text>
                </RNView>

                {/* Voice */}
                {room?.voiceEnabled && (
                    <RNView style={styles.voiceSection}>
                        <Text weight="semiBold" style={styles.sectionLabel}>Voice chat</Text>
                        <VoiceControls roomId={roomId} />
                    </RNView>
                )}

                {/* Actions */}
                <RNView style={styles.actions}>
                    <TouchableOpacity style={styles.shareBtn} onPress={copyCode} activeOpacity={0.8}>
                        <FontAwesome name="share-alt" size={13} color={palette.mutedText} />
                        <Text weight="medium" style={styles.shareText}>Share room code</Text>
                    </TouchableOpacity>

                    {isHost ? (
                        <TouchableOpacity
                            style={[styles.startBtn, (!canStart || starting) && styles.startBtnDisabled]}
                            activeOpacity={0.88}
                            onPress={handleStart}
                            disabled={!canStart || starting}
                        >
                            <FontAwesome name="play" size={14} color="#fff" />
                            <Text weight="bold" style={styles.startText}>
                                {starting ? 'Starting…' : isFull ? 'Start Game' : `Start (${players.length}/${maxPlayers})`}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <GlassPanel intensity="light" style={styles.waitPanel}>
                            <RNView style={styles.waitDots}>
                                {[0, 1, 2].map(i => <WaitingDot key={i} delay={i * 180} />)}
                            </RNView>
                            <Text weight="medium" style={styles.waitText}>Waiting for host to start</Text>
                        </GlassPanel>
                    )}
                </RNView>
            </ScrollView>

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={hideDialog}
                actions={dialog.actions}
            />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    scroll: { paddingHorizontal: 18, gap: 18 },
    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBtnPlaceholder: { width: 40 },
    topCenter: { flex: 1, alignItems: 'center', gap: 4 },
    topTitle: { fontSize: 17, color: palette.text, letterSpacing: 0.3 },
    connRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    connDot: { width: 6, height: 6, borderRadius: 3 },
    connText: { fontSize: 11, color: palette.mutedText },
    codeHero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 10 },
    codeLabel: { fontSize: 11, color: palette.mutedText, letterSpacing: 2.5 },
    codeTap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    codeValue: {
        fontSize: 42,
        color: palette.text,
        letterSpacing: 10,
        fontFamily: 'SpaceMono-Regular',
    },
    copyBadge: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    codeHint: { fontSize: 12, color: palette.dimText },
    progressTrack: {
        width: '100%',
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginTop: 6,
        overflow: 'hidden',
    },
    progressFill: { height: 3, backgroundColor: LUDO.red, borderRadius: 2 },
    playerCount: { fontSize: 13, color: palette.mutedText },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
    gridTwo: { flexWrap: 'nowrap' },
    cardWrap: { width: '47.5%' },
    playerCard: { alignItems: 'center', paddingTop: 16, paddingBottom: 14, paddingHorizontal: 12, gap: 8, overflow: 'hidden' },
    colorBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    avatarWrap: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64 },
    voiceRing: {
        position: 'absolute',
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    avatarText: { fontSize: 18, color: '#fff', letterSpacing: 0.5 },
    offlineDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: LUDO.yellow,
        borderWidth: 2,
        borderColor: palette.card,
    },
    playerName: { fontSize: 14, color: palette.text, maxWidth: '100%' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    colorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    colorDot: { width: 6, height: 6, borderRadius: 3 },
    colorPillText: { fontSize: 9, letterSpacing: 1 },
    hostPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(240, 181, 48, 0.14)',
    },
    hostText: { fontSize: 8, color: LUDO.yellow, letterSpacing: 0.6 },
    voiceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
    },
    voiceChipText: { fontSize: 9, letterSpacing: 0.4 },
    emptyCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12, gap: 8, borderStyle: 'dashed' },
    emptyAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: palette.glassBorder,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyLabel: { fontSize: 12, color: palette.dimText },
    emptyDots: { flexDirection: 'row', gap: 5 },
    waitDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.dimText },
    statusWrap: { alignItems: 'center' },
    statusText: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
    voiceSection: { gap: 10 },
    sectionLabel: { fontSize: 12, color: palette.mutedText, letterSpacing: 0.5 },
    actions: { gap: 10 },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
    },
    shareText: { fontSize: 13, color: palette.mutedText },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: LUDO.red,
        borderRadius: 16,
        paddingVertical: 16,
    },
    startBtnDisabled: { opacity: 0.45 },
    startText: { fontSize: 15, color: '#fff', letterSpacing: 0.3 },
    waitPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
    },
    waitDots: { flexDirection: 'row', gap: 5 },
    waitText: { fontSize: 14, color: palette.mutedText },
});
