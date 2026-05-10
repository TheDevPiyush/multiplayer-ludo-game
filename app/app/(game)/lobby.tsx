import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRoom, leaveRoom, startGame } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { supabase } from '@/util/supabase-client';

const palette = Colors['dark'];

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = {
    id: string;
    userId: string;
    username: string;
    color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
    isReady: boolean;
    isHost: boolean;
};

const COLOR_HEX: Record<string, string> = {
    RED: '#D94444',
    BLUE: '#3B7DD8',
    GREEN: '#2DAA5C',
    YELLOW: '#E8A520',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function WaitingDot({ delay }: { delay: number }) {
    const anim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[styles.waitDot, { opacity: anim }]} />;
}

function PlayerSlot({ player }: { player: Player | null }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.88)).current;

    useEffect(() => {
        if (player) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
            ]).start();
        }
    }, [player?.id]);

    const color = player ? COLOR_HEX[player.color] : null;

    if (!player) {
        return (
            <RNView style={[styles.slot, styles.slotEmpty]}>
                <RNView style={styles.slotEmptyAvatar}>
                    <FontAwesome name="user-o" size={20} color={palette.dimText} />
                </RNView>
                <Text weight="medium" style={styles.slotEmptyText}>Waiting...</Text>
                <RNView style={styles.slotEmptyDots}>
                    {[0, 1, 2].map(i => <WaitingDot key={i} delay={i * 200} />)}
                </RNView>
            </RNView>
        );
    }

    return (
        <Animated.View style={[styles.slot, { opacity: fadeAnim, transform: [{ scale: scaleAnim }], borderColor: color + '40' }]}>
            <RNView style={[styles.slotAccent, { backgroundColor: color! }]} />
            <RNView style={[styles.slotAvatar, { backgroundColor: color! }]}>
                <Text weight="bold" style={styles.slotAvatarText}>
                    {player.username.slice(0, 2).toUpperCase()}
                </Text>
                <RNView style={styles.slotAvatarDot} />
            </RNView>
            <Text weight="bold" style={styles.slotUsername} numberOfLines={1}>@{player.username}</Text>
            <Text weight="semiBold" style={[styles.slotColor, { color: color! }]}>{player.color}</Text>
            <RNView style={styles.slotBadgeRow}>
                {player.isHost && (
                    <RNView style={styles.hostBadge}>
                        <FontAwesome name="star" size={8} color="#E8A520" />
                        <Text weight="bold" style={styles.hostBadgeText}>HOST</Text>
                    </RNView>
                )}
                <RNView style={[styles.readyBadge, { backgroundColor: player.isReady ? '#2DAA5C20' : palette.elevated }]}>
                    <RNView style={[styles.readyDot, { backgroundColor: player.isReady ? '#2DAA5C' : palette.dimText }]} />
                    <Text weight="semiBold" style={[styles.readyText, { color: player.isReady ? '#2DAA5C' : palette.dimText }]}>
                        {player.isReady ? 'Ready' : 'Waiting'}
                    </Text>
                </RNView>
            </RNView>
        </Animated.View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LobbyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();

    const { gameCode: rawGameCode, maxPlayers_: maxPlayersParam, roomId: rawRoomId } =
        useLocalSearchParams<{
            gameCode?: string | string[];
            maxPlayers_?: string;
            roomId?: string | string[];
        }>();

    const roomCode = typeof rawGameCode === 'string' ? rawGameCode.trim() : String(rawGameCode?.[0] ?? '').trim();
    const roomId = typeof rawRoomId === 'string' ? rawRoomId.trim() : String(rawRoomId?.[0] ?? '').trim();
    const maxPlayers = Number(maxPlayersParam) || 4;

    // ── State ──
    const [players, setPlayers] = useState<Player[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [dialog, setDialog] = useState({
        visible: false, title: '', message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const serverLeaveDoneRef = useRef(false);
    const selfPlayer = players.find(p => p.userId === currentUserId);
    const isHost = selfPlayer?.isHost ?? false;
    const isFull = players.length === maxPlayers;
    const canStart = players.length >= 2;

    // ── Dialog helpers ──
    const hideDialog = () => setDialog(p => ({ ...p, visible: false }));
    const showError = (title: string, message: string) =>
        setDialog({ visible: true, title, message, actions: undefined });

    // ── Get current user ──
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id ?? null);
        });
    }, []);

    // ── Initial room fetch ──
    const fetchPlayers = useCallback(async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token || !roomCode) return;

        const result = await getRoom(token, roomCode);
        if (!result.ok) return;

        const room = result.data.data;
        const mapped: Player[] = room.players.map((p: any) => ({
            id: p.id,
            userId: p.userId,
            username: p.user.username,
            color: p.color,
            isReady: p.isReady,
            isHost: p.userId === room.createdById,
        }));
        setPlayers(mapped);
    }, [roomCode]);

    useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

    // ── Supabase Realtime ──
    useEffect(() => {
        if (!roomId) return;

        const channel = supabase
            .channel(`lobby:${roomId}`)

            // game_players — player joins / leaves / updates ready
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'GamePlayer', filter: `gameRoomId=eq.${roomId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        fetchPlayers();
                    }
                    if (payload.eventType === 'UPDATE') {
                        setPlayers(prev =>
                            prev.map(p =>
                                p.id === payload.new.id
                                    ? { ...p, isReady: payload.new.is_ready }
                                    : p
                            )
                        );
                    }
                    if (payload.eventType === 'DELETE') {
                        setPlayers(prev => prev.filter(p => p.id !== payload.old.id));
                    }
                }
            )

            // game_rooms — host starts or cancels
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'GameRoom', filter: `id=eq.${roomId}` },
                (payload) => {
                    if (payload.new.status === 'PLAYING') {
                        // All players navigate to board
                        serverLeaveDoneRef.current = true;
                        router.replace(`/(game)/board?gameCode=${roomCode}&roomId=${roomId}`);
                    }
                    if (payload.new.status === 'CANCELLED') {
                        showError('Room Cancelled', 'The host cancelled the room.');
                        setTimeout(() => {
                            serverLeaveDoneRef.current = true;
                            router.replace('/(tabs)');
                        }, 2000);
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [roomId, fetchPlayers]);

    // ── Leave helpers ──
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
                                showError('Could not leave', (result as any).error);
                                return;
                            }
                            serverLeaveDoneRef.current = true;
                            hideDialog();
                            router.back();
                        })();
                    },
                },
            ],
        });
    }

    // Intercept hardware back / gesture swipe
    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (serverLeaveDoneRef.current) { serverLeaveDoneRef.current = false; return; }
            if (!roomCode) return;
            e.preventDefault();
            void (async () => {
                const result = await notifyServerLeave();
                if (!result.ok) { showError('Could not leave', (result as any).error); return; }
                serverLeaveDoneRef.current = true;
                navigation.dispatch(e.data.action);
            })();
        });
        return unsub;
    }, [navigation, roomCode]);

    // ── Start game ──
    const handleStart = async () => {
        if (!canStart) { showError('Not enough players', 'Need at least 2 players to start.'); return; }
        try {
            setStarting(true);
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token!;
            const result = await startGame(token, roomCode);
            if (!result.ok) showError('Could not start', (result as any).error);
            // Navigation triggered by Realtime game_rooms UPDATE → PLAYING
        } catch {
            showError('Error', 'Something went wrong.');
        } finally {
            setStarting(false);
        }
    };

    const copyCode = async () => {
        await Clipboard.setStringAsync(roomCode);
        setDialog({ visible: true, title: 'Copied!', message: `Room code ${roomCode} copied.`, actions: undefined });
    };

    // ── Animations ──
    const fadeHeader = useRef(new Animated.Value(0)).current;
    const slideHeader = useRef(new Animated.Value(-16)).current;
    const fadeGrid = useRef(new Animated.Value(0)).current;
    const slideGrid = useRef(new Animated.Value(20)).current;
    const fadeFooter = useRef(new Animated.Value(0)).current;
    const pulseRing = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseRing, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseRing, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

        Animated.stagger(100, [
            Animated.parallel([
                Animated.timing(fadeHeader, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideHeader, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(fadeGrid, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideGrid, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.timing(fadeFooter, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, []);

    const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] ?? null);

    return (
        <RNView style={[styles.screen, { backgroundColor: palette.background }]}>

            <RNView style={[styles.blob, { top: -60, left: -60, backgroundColor: '#2DAA5C' }]} />
            <RNView style={[styles.blob, { bottom: -60, right: -60, backgroundColor: '#3B7DD8' }]} />

            {/* ── Header ── */}
            <Animated.View style={[styles.header, { paddingTop: insets.top + 12, opacity: fadeHeader, transform: [{ translateY: slideHeader }] }]}>
                <TouchableOpacity onPress={openLeaveDialog} style={styles.backBtn} activeOpacity={0.7}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <RNView style={styles.headerCenter}>
                    <Text weight="bold" style={styles.headerTitle}>Waiting Room</Text>
                    <Text weight="medium" style={styles.headerSub}>{players.length}/{maxPlayers} players joined</Text>
                </RNView>
                <TouchableOpacity style={styles.codeChip} onPress={copyCode} activeOpacity={0.8}>
                    <Text weight="bold" style={styles.codeText}>{roomCode || '—'}</Text>
                    <FontAwesome name="copy" size={10} color={palette.mutedText} />
                </TouchableOpacity>
            </Animated.View>

            {/* ── Progress bar ── */}
            <RNView style={styles.progressBar}>
                <RNView style={[styles.progressFill, { width: `${(players.length / maxPlayers) * 100}%` as any }]} />
            </RNView>

            {/* ── Player grid ── */}
            <Animated.View style={[styles.gridWrap, { opacity: fadeGrid, transform: [{ translateY: slideGrid }] }]}>
                <RNView style={[styles.grid, maxPlayers === 2 && styles.gridTwo]}>
                    {slots.map((player, i) => (
                        <PlayerSlot key={player?.id ?? `empty-${i}`} player={player} />
                    ))}
                </RNView>
            </Animated.View>

            {/* ── Status line ── */}
            <Animated.View style={[styles.statusRow, { opacity: fadeFooter }]}>
                {isFull ? (
                    <>
                        <RNView style={[styles.statusDot, { backgroundColor: '#2DAA5C' }]} />
                        <Text weight="semiBold" style={[styles.statusText, { color: '#2DAA5C' }]}>Room is full — ready to start!</Text>
                    </>
                ) : (
                    <>
                        <Animated.View style={{ transform: [{ scale: pulseRing }] }}>
                            <RNView style={[styles.statusDot, { backgroundColor: '#E8A520' }]} />
                        </Animated.View>
                        <Text weight="medium" style={styles.statusText}>
                            Waiting for {maxPlayers - players.length} more player{maxPlayers - players.length > 1 ? 's' : ''}...
                        </Text>
                    </>
                )}
            </Animated.View>

            {/* ── Footer ── */}
            <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + 16, opacity: fadeFooter }]}>
                <TouchableOpacity style={styles.shareBtn} onPress={copyCode} activeOpacity={0.8}>
                    <FontAwesome name="share-alt" size={13} color={palette.mutedText} />
                    <Text weight="medium" style={styles.shareBtnText}>
                        Share code{'  '}
                        <Text weight="bold" style={{ color: palette.text }}>{roomCode || '—'}</Text>
                    </Text>
                    <FontAwesome name="copy" size={12} color={palette.mutedText} />
                </TouchableOpacity>

                {isHost ? (
                    <TouchableOpacity
                        style={[styles.startBtn, (!canStart || starting) && { opacity: 0.5 }]}
                        activeOpacity={0.85}
                        onPress={handleStart}
                        disabled={!canStart || starting}
                    >
                        <FontAwesome name="play" size={14} color="#fff" />
                        <Text weight="bold" style={styles.startBtnText}>
                            {starting ? 'Starting...' : isFull ? 'Start Game' : `Start Anyway (${players.length}/${maxPlayers})`}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <RNView style={styles.waitingBtn}>
                        <WaitingDot delay={0} />
                        <WaitingDot delay={200} />
                        <WaitingDot delay={400} />
                        <Text weight="medium" style={styles.waitingBtnText}>Waiting for host to start</Text>
                    </RNView>
                )}
            </Animated.View>

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1 },
    blob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, opacity: 0.05 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { alignItems: 'center', gap: 2 },
    headerTitle: { fontSize: 16, color: palette.text, letterSpacing: 0.2 },
    headerSub: { fontSize: 11, color: palette.mutedText },
    codeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
    codeText: { fontSize: 13, color: palette.text, letterSpacing: 2, fontFamily: 'SpaceMono-Regular' },
    progressBar: { height: 2, backgroundColor: palette.elevated },
    progressFill: { height: 2, backgroundColor: '#D94444', borderRadius: 2 },
    gridWrap: { flex: 1, padding: 16, justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
    gridTwo: { flexDirection: 'row', flexWrap: 'nowrap' },
    slot: { width: '47%', backgroundColor: palette.card, borderRadius: 20, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', alignItems: 'center', paddingVertical: 22, paddingHorizontal: 12, gap: 8 },
    slotAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    slotAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.2)' },
    slotAvatarText: { fontSize: 20, color: '#fff', letterSpacing: 1 },
    slotAvatarDot: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.22)' },
    slotUsername: { fontSize: 13, color: palette.text, letterSpacing: 0.2 },
    slotColor: { fontSize: 10, letterSpacing: 1.5 },
    slotBadgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    hostBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8A52018', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6 },
    hostBadgeText: { fontSize: 8, color: '#E8A520', letterSpacing: 0.5 },
    readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6 },
    readyDot: { width: 5, height: 5, borderRadius: 2.5 },
    readyText: { fontSize: 9, letterSpacing: 0.3 },
    slotEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent' },
    slotEmptyAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: palette.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.border, borderStyle: 'dashed' },
    slotEmptyText: { fontSize: 12, color: palette.dimText },
    slotEmptyDots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    waitDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.dimText },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { fontSize: 12, color: palette.mutedText },
    footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, gap: 10 },
    shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.elevated, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, paddingVertical: 12, paddingHorizontal: 16 },
    shareBtnText: { flex: 1, fontSize: 13, color: palette.mutedText },
    startBtn: { backgroundColor: '#D94444', borderRadius: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    startBtnText: { fontSize: 15, color: '#fff', letterSpacing: 0.3 },
    waitingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: palette.card, borderRadius: 16, paddingVertical: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
    waitingBtnText: { fontSize: 14, color: palette.mutedText },
});