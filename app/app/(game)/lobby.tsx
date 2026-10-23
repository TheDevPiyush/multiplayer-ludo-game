import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    useWindowDimensions,
    View as RNView,
} from 'react-native';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { GameTile } from '@/components/GameTile';
import { InviteFriendsSheet } from '@/components/InviteFriendsSheet';
import { COLOR_BRIGHT, COLOR_DARK, COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { AudioOutputButton, MicButton } from '@/components/VoiceButtons';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom, type RoomPlayer } from '@/hooks/useGameRoom';
import { useSocket } from '@/components/SocketProvider';
import { useVoiceRoom } from '@/components/VoiceRoomProvider';
import { supabase } from '@/util/supabase-client';
import { setActiveRoom } from '@/util/active-room';
import { roomInviteUrl } from '@/util/links';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const GRID_GAP = 12;
const SEAT_HEIGHT = 150;

// ─── Sub-components ───────────────────────────────────────────────────────────

function WaitingDot({ delay }: { delay: number }) {
    const v = useSharedValue(0.3);
    useEffect(() => {
        v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.3, { duration: 450 })), -1));
    }, [delay, v]);
    const style = useAnimatedStyle(() => ({ opacity: v.value }));
    return <Animated.View style={[styles.waitDot, style]} />;
}

function WaitingDots() {
    return (
        <RNView style={styles.waitDots}>
            {[0, 1, 2].map(i => <WaitingDot key={i} delay={i * 150} />)}
        </RNView>
    );
}

type SlotData = RoomPlayer & { isHost: boolean; isMe: boolean; isOnline: boolean; inVoice: boolean; voiceMuted: boolean };

/** A seated player: a tile in their colour. */
function PlayerSeat({ player, width, onMicTap }: { player: SlotData; width: number; onMicTap?: () => void }) {
    const voiceIcon: IconName = !player.inVoice ? 'microphone-off' : player.voiceMuted ? 'microphone-off' : 'microphone';
    const voiceLive = player.inVoice && !player.voiceMuted;
    return (
        <GameTile
            colors={[COLOR_BRIGHT[player.color]!, COLOR_HEX[player.color]!]}
            edge={COLOR_DARK[player.color]!}
            radius={22}
            depth={5}
            style={{ width }}
            contentStyle={[styles.seat, !player.isOnline && { opacity: 0.55 }]}
        >
            {player.isHost && (
                <RNView style={styles.hostChip}>
                    <MaterialCommunityIcons name="crown" size={13} color="#B7791F" />
                    <Text weight="bold" style={styles.hostText}>HOST</Text>
                </RNView>
            )}
            <Pressable
                onPress={onMicTap}
                disabled={!onMicTap}
                hitSlop={8}
                style={[styles.voiceBadge, voiceLive && styles.voiceBadgeLive]}
                accessibilityLabel={!player.inVoice ? 'Not in voice' : player.voiceMuted ? 'Muted' : 'Talking'}
            >
                <MaterialCommunityIcons name={voiceIcon} size={14} color={voiceLive ? COLOR_DARK[player.color] : 'rgba(255,255,255,0.85)'} />
            </Pressable>

            <RNView style={styles.seatAvatar}>
                <UserAvatar user={{ id: player.userId, ...player.user }} size={58} />
            </RNView>
            <Text weight="bold" style={styles.seatName} numberOfLines={1}>
                {player.isMe ? 'You' : player.user.username}
            </Text>
            <Text weight="semiBold" style={styles.seatSub} numberOfLines={1}>
                {!player.isOnline ? 'Offline' : player.isMe ? `@${player.user.username}` : 'Ready'}
            </Text>
        </GameTile>
    );
}

/** An open seat: the host taps it to invite a friend; everyone else sees it waiting. */
function EmptySeat({ width, onInvite }: { width: number; onInvite?: () => void }) {
    return (
        <Pressable
            onPress={onInvite}
            disabled={!onInvite}
            style={({ pressed }) => [styles.emptySeat, { width }, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
            accessibilityLabel={onInvite ? 'Invite a friend' : 'Open seat'}
        >
            <RNView style={styles.emptyIcon}>
                <MaterialCommunityIcons name={onInvite ? 'account-plus' : 'account-clock'} size={26} color="#FFFFFF" />
            </RNView>
            <Text weight="bold" style={styles.emptyTitle}>{onInvite ? 'Invite' : 'Open seat'}</Text>
            {onInvite ? <Text weight="medium" style={styles.emptySub}>Tap to add a friend</Text> : <WaitingDots />}
        </Pressable>
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
    const [inviteOpen, setInviteOpen] = useState(false);

    const { room, onlineUserIds, voicePeers, joinError } = useGameRoom({ roomId, gameCode: roomCode });
    const { startGame } = useGameActions(roomCode);
    const voice = useVoiceRoom();

    const players = room?.players ?? [];
    const selfPlayer = players.find(p => p.userId === currentUserId);
    const isHost = !!room && !!selfPlayer && selfPlayer.userId === room.createdById;
    const isFull = players.length === maxPlayers;
    const canStart = players.length >= 2;

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
        // A room that's over can't be reopened (e.g. resumed from a stale active room).
        if (room?.status === 'CANCELLED' || room?.status === 'FINISHED') {
            showError(
                room.status === 'CANCELLED' ? 'Room Cancelled' : 'Game Over',
                room.status === 'CANCELLED' ? 'The host cancelled the room.' : 'This game has already finished.',
            );
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
        supabase.auth.getSession().then(({ data }) => setCurrentUserId(data.session?.user.id ?? null));
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

    /** Confirm, tell the server, then continue (`then`, or plain back). */
    function openLeaveDialog(then?: () => void) {
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
                            if (then) then();
                            else router.back();
                        })();
                    },
                },
            ],
        });
    }

    // System back / swipe: ask first — for the host, leaving cancels the room for everyone.
    const openLeaveRef = useRef(openLeaveDialog);
    openLeaveRef.current = openLeaveDialog;
    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (serverLeaveDoneRef.current) { serverLeaveDoneRef.current = false; return; }
            if (!roomCode) return;
            e.preventDefault();
            openLeaveRef.current(() => navigation.dispatch(e.data.action));
        });
        return unsub;
    }, [navigation, roomCode]);

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

    const [copied, setCopied] = useState(false);
    const copyCode = async () => {
        await Clipboard.setStringAsync(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    /** The link opens the app and joins this room; the code is there for typing in by hand. */
    const shareInvite = async () => {
        const url = roomInviteUrl(roomCode);
        try {
            await Share.share({ message: `Join my Ludo game! Tap to join: ${url}\nor enter room code ${roomCode} in Simple Ludo.` });
        } catch {
            await Clipboard.setStringAsync(url);
            setDialog({ visible: true, title: 'Link copied', message: url, actions: undefined });
        }
    };

    const slotData = useMemo<SlotData[]>(() => {
        if (!room) return [];
        return players.map(p => {
            const inVoice = voicePeers.includes(p.userId) || (p.userId === currentUserId && voice.inRoom);
            const isMe = p.userId === currentUserId;
            const voiceMuted = isMe ? voice.isMuted : (voice.peers.find(vp => vp.userId === p.userId)?.muted ?? false);
            return {
                ...p,
                isMe,
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

    const { width: screenW } = useWindowDimensions();
    const seatW = (screenW - 36 - GRID_GAP) / 2;
    const connColor = connectionPhase === 'connected' ? '#22C55E' : connectionPhase === 'offline' ? '#FF4D5E' : '#FFC83D';
    const missing = maxPlayers - players.length;
    const memberIds = useMemo(() => players.map(p => p.userId), [players]);

    return (
        <RNView style={styles.screen}>
            {/* Header */}
            <RNView style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => openLeaveDialog()} style={styles.roundBtn} hitSlop={6} accessibilityLabel="Leave room">
                    <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
                </Pressable>
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Room lobby</Text>
                    <RNView style={styles.connRow}>
                        <RNView style={[styles.connDot, { backgroundColor: connColor }]} />
                        <Text weight="medium" style={styles.connText}>{connectionLabel(connectionPhase)}</Text>
                    </RNView>
                </RNView>
                {room?.voiceEnabled && (
                    <RNView style={styles.voiceRow}>
                        <MicButton roomId={roomId} />
                        <AudioOutputButton />
                    </RNView>
                )}
            </RNView>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Room code */}
                <Animated.View entering={FadeInDown.duration(380)}>
                    <GameTile colors={['#FF5A5F', '#FF8A3D']} edge="#C2304A" radius={26} depth={6} contentStyle={styles.codeCard}>
                        <RNView style={styles.codeTop}>
                            <Text weight="bold" style={styles.codeLabel}>ROOM CODE</Text>
                            <RNView style={styles.countChip}>
                                <MaterialCommunityIcons name="account-group" size={14} color="#FFFFFF" />
                                <Text weight="bold" style={styles.countText}>{players.length}/{maxPlayers}</Text>
                            </RNView>
                        </RNView>
                        <Pressable onPress={copyCode} style={styles.codeRow} hitSlop={6} accessibilityLabel="Copy room code">
                            <Text weight="bold" style={styles.code}>{roomCode || '——'}</Text>
                            <RNView style={styles.copyBtn}>
                                <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={16} color="#FFFFFF" />
                            </RNView>
                        </Pressable>
                        <GameTile
                            colors={['#FFFFFF', '#FFF1EC']}
                            edge="#E2A895"
                            radius={16}
                            depth={5}
                            onPress={shareInvite}
                            contentStyle={styles.shareBtn}
                        >
                            <MaterialCommunityIcons name="share-variant" size={18} color="#E2364A" />
                            <Text weight="bold" style={styles.shareText}>Share invite link</Text>
                        </GameTile>
                    </GameTile>
                </Animated.View>

                {/* Seats */}
                <Animated.View entering={FadeInDown.delay(80).duration(380)} style={{ gap: 12 }}>
                    <Text weight="bold" style={styles.section}>
                        {missing > 0 ? `Players · waiting for ${missing} more` : 'Players · everyone’s here!'}
                    </Text>
                    <RNView style={styles.grid}>
                        {slots.map((player, i) =>
                            player ? (
                                <PlayerSeat
                                    key={player.id}
                                    player={player}
                                    width={seatW}
                                    onMicTap={player.isMe && voice.inRoom ? voice.toggleMute : undefined}
                                />
                            ) : (
                                <EmptySeat key={`empty-${i}`} width={seatW} onInvite={isHost ? () => setInviteOpen(true) : undefined} />
                            ),
                        )}
                    </RNView>
                </Animated.View>
            </ScrollView>

            {/* Start / waiting */}
            <RNView style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
                {isHost ? (
                    <GameTile
                        colors={canStart ? ['#22D07A', '#0FAE62'] : ['#A3A8CC', '#8A90B8']}
                        edge={canStart ? '#08804A' : '#666C99'}
                        radius={20}
                        depth={6}
                        onPress={handleStart}
                        disabled={!canStart || starting}
                        contentStyle={styles.startBtn}
                    >
                        <MaterialCommunityIcons name={starting ? 'timer-sand' : 'play'} size={24} color="#FFFFFF" />
                        <Text weight="bold" style={styles.startText}>
                            {starting ? 'Starting…' : canStart ? 'Start game' : 'Need 2 players to start'}
                        </Text>
                    </GameTile>
                ) : (
                    <RNView style={styles.waitPanel}>
                        <WaitingDots />
                        <Text weight="semiBold" style={styles.waitText}>Waiting for the host to start</Text>
                    </RNView>
                )}
            </RNView>

            <InviteFriendsSheet
                visible={inviteOpen}
                onClose={() => setInviteOpen(false)}
                gameCode={roomCode}
                memberIds={memberIds}
                onShareLink={() => {
                    setInviteOpen(false);
                    void shareInvite();
                }}
            />

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
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
    roundBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    title: { fontSize: 20, color: '#FFFFFF' },
    connRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    connDot: { width: 8, height: 8, borderRadius: 4 },
    connText: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
    voiceRow: { flexDirection: 'row', gap: 8 },

    scroll: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16, gap: 22 },

    codeCard: { padding: 18, gap: 14 },
    codeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    codeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 1.4 },
    countChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    countText: { fontSize: 12, color: '#FFFFFF' },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    code: { fontSize: 40, color: '#FFFFFF', letterSpacing: 6, fontFamily: 'SpaceMono-Regular' },
    copyBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46 },
    shareText: { fontSize: 15, color: '#E2364A' },

    section: { fontSize: 15, color: '#FFFFFF' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    seat: { height: SEAT_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 10 },
    seatAvatar: { borderRadius: 33, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', marginBottom: 6 },
    seatName: { fontSize: 16, color: '#FFFFFF' },
    seatSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
    hostChip: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#FFE08A',
    },
    hostText: { fontSize: 10, color: '#8A5A00', letterSpacing: 0.6 },
    voiceBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.18)',
    },
    voiceBadgeLive: { backgroundColor: '#FFFFFF' },

    emptySeat: {
        height: SEAT_HEIGHT + 5,
        borderRadius: 22,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    emptyIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
        marginBottom: 4,
    },
    emptyTitle: { fontSize: 15, color: '#FFFFFF' },
    emptySub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    waitDots: { flexDirection: 'row', gap: 5, height: 14, alignItems: 'center' },
    waitDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },

    footer: { paddingHorizontal: 18, paddingTop: 8 },
    startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60 },
    startText: { fontSize: 18, color: '#FFFFFF' },
    waitPanel: {
        height: 60,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    waitText: { fontSize: 15, color: 'rgba(255,255,255,0.85)' },
});
