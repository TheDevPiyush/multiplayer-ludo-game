import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { RollingDice } from '@/components/ludo/Dice';
import { BOARD_SIZE, COLOR_HEX, layoutTokens } from '@/components/ludo/geometry';
import { LudoBoard } from '@/components/ludo/LudoBoard';
import { PlayerStrip, type PlayerStripProps } from '@/components/ludo/PlayerStrip';
import { Token } from '@/components/ludo/Token';
import { Text } from '@/components/Themed';
import { VoiceControls } from '@/components/VoiceControls';
import Colors from '@/constants/Colors';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom } from '@/hooks/useGameRoom';
import { markHistoryStale } from '@/util/history-cache';
import { useSocket } from '@/components/SocketProvider';
import { useVoiceRoom } from '@/components/VoiceRoomProvider';
import { setActiveRoom } from '@/util/active-room';
import { supabase } from '@/util/supabase-client';


const ROLL_ANIM_MS = 800;

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

const palette = Colors['dark'];


// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function GameBoardScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const { gameCode: rawCode, roomId: rawRoomId } = useLocalSearchParams<any>();
    const gameCode = typeof rawCode === 'string' ? rawCode : String(rawCode?.[0] ?? '');
    const roomId = typeof rawRoomId === 'string' ? rawRoomId : String(rawRoomId?.[0] ?? '');

    const { connectionPhase, isRealtimeReady } = useSocket();
    const voice = useVoiceRoom();
    const { rollDice, moveToken } = useGameActions(gameCode);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [rolling, setRolling] = useState(false);
    /** Last rolled value — kept visible after turn changes until the next roll. */
    const [lastShownDice, setLastShownDice] = useState<number | null>(null);
    /** Color of the player whose roll is animating (for opponent rolls). */
    const [rollingColor, setRollingColor] = useState<string | null>(null);
    const [disconnectingIds, setDisconnectingIds] = useState<Set<string>>(new Set());
    const [capturedKey, setCapturedKey] = useState<string | null>(null);
    const [winnerInfo, setWinnerInfo] = useState<{ winnerId: string; winnerColor: string } | null>(null);
    const [dialog, setDialog] = useState({
        visible: false, title: '', message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const leftRef = useRef(false);
    const rollingRef = useRef(false);
    const currentUserIdRef = useRef<string | null>(null);
    const runRollAnimationRef = useRef<(finalValue: number, rollerColor: string) => Promise<void>>(
        async () => {},
    );
    currentUserIdRef.current = currentUserId;
    rollingRef.current = rolling;

    const { room } = useGameRoom({
        roomId,
        gameCode,
        onEvent: (e) => {
            if (e.type === 'dice') {
                // Local player already animates in handleRollDice — skip duplicate.
                if (e.byUserId !== currentUserIdRef.current) {
                    void runRollAnimationRef.current(e.diceValue, e.color);
                }
                return;
            }
            if (e.type === 'capture') {
                setCapturedKey(`${e.capturedUserId}:${e.capturedTokenIndex}:${Date.now()}`);
            }
            if (e.type === 'presence:disconnecting') {
                setDisconnectingIds(prev => new Set(prev).add(e.userId));
            }
            if (e.type === 'presence:connected' || e.type === 'presence:reconnected') {
                setDisconnectingIds(prev => {
                    const next = new Set(prev);
                    next.delete(e.userId);
                    return next;
                });
            }
            if (e.type === 'presence:disconnected') {
                setDisconnectingIds(prev => {
                    const next = new Set(prev);
                    next.delete(e.userId);
                    return next;
                });
            }
            if (e.type === 'over') {
                markHistoryStale();
                setWinnerInfo({ winnerId: e.winnerId, winnerColor: e.winnerColor });
            }
            if (e.type === 'cancelled') {
                showError('Room ended', 'The room has been closed.');
                setTimeout(() => {
                    leftRef.current = true;
                    void setActiveRoom(null);
                    router.replace('/(tabs)');
                }, 1500);
            }
        },
    });

    const players = room?.players ?? [];
    const currentColor = room?.currentTurnColor ?? 'RED';
    const diceValue = room?.currentDice ?? null;

    const selfPlayer = useMemo(
        () => players.find(p => p.userId === currentUserId),
        [players, currentUserId],
    );

    const isMyTurn = !!selfPlayer && selfPlayer.color === currentColor && room?.status === 'PLAYING';

    // Persist active room
    useEffect(() => {
        if (roomId && gameCode && room) {
            void setActiveRoom({
                roomId,
                gameCode,
                maxPlayers: room.maxPlayers,
                screen: 'board',
            });
        }
    }, [roomId, gameCode, room?.maxPlayers]);

    useEffect(() => {
        // getSession reads local storage; getUser would hit Supabase over the network.
        supabase.auth.getSession().then(({ data }) => {
            setCurrentUserId(data.session?.user.id ?? null);
        });
    }, []);

    // Keep voice alive across lobby → board; resync peers when board loads
    const voiceSyncedRef = useRef(false);
    useEffect(() => {
        voiceSyncedRef.current = false;
    }, [roomId]);

    useEffect(() => {
        if (!room?.voiceEnabled || !roomId || !isRealtimeReady || room?.status !== 'PLAYING') return;
        if (voiceSyncedRef.current) return;
        voiceSyncedRef.current = true;

        if (voice.inRoom && voice.roomId === roomId) {
            voice.resync();
        } else {
            void voice.join(roomId);
        }
    }, [room?.voiceEnabled, roomId, room?.status, isRealtimeReady, voice.inRoom, voice.roomId, voice.join, voice.resync]);

    // Remember every rolled value so it stays visible after the turn advances.
    useEffect(() => {
        if (diceValue !== null) setLastShownDice(diceValue);
    }, [diceValue]);

    // ── Dice animation ──
    const runRollAnimation = useCallback(async (finalValue: number, rollerColor: string) => {
        if (rollingRef.current) return;

        setRolling(true);
        setRollingColor(rollerColor);
        rollingRef.current = true;

        await sleep(ROLL_ANIM_MS);

        setLastShownDice(finalValue);
        setRolling(false);
        setRollingColor(null);
        rollingRef.current = false;
    }, []);

    runRollAnimationRef.current = runRollAnimation;

    const handleRollDice = async () => {
        if (!isMyTurn || rolling || diceValue !== null || !isRealtimeReady || !selfPlayer) return;

        setRolling(true);
        setRollingColor(selfPlayer.color);
        rollingRef.current = true;

        try {
            const [result] = await Promise.all([rollDice(), sleep(ROLL_ANIM_MS)]);

            if (!result.ok) {
                console.warn('[board] rollDice failed:', result.error);
                setDialog({
                    visible: true,
                    title: 'Could not roll',
                    message: result.error,
                    actions: undefined,
                });
                return;
            }
            setLastShownDice(result.data?.diceValue ?? null);
        } finally {
            setRolling(false);
            setRollingColor(null);
            rollingRef.current = false;
        }
    };

    const visibleDice = diceValue ?? lastShownDice;
    const canRoll = isMyTurn && diceValue === null && !rolling && isRealtimeReady;

    // No-move passes and single-option moves are played by the server
    // (after a short pause so the dice result stays visible).
    const movable = room?.movableTokens ?? [];

    const handleTokenPress = async (tokenIndex: number) => {
        if (!isMyTurn || diceValue === null || !selfPlayer) return;
        if (!movable.includes(tokenIndex)) return;
        await moveToken(tokenIndex);
    };

    // Token coords & stacking
    const tokenItems = useMemo(() => {
        const layout = layoutTokens(players.map(p => ({ color: p.color, tokens: p.tokenPositions ?? [], owner: p.userId })));
        return layout.map(t => ({
            ...t,
            userId: t.owner,
            canMove: isMyTurn && t.owner === currentUserId && diceValue !== null && movable.includes(t.tokenIndex),
            captured: !!capturedKey && capturedKey.startsWith(`${t.owner}:${t.tokenIndex}:`) && t.pos === 0,
        }));
    }, [players, isMyTurn, diceValue, currentUserId, capturedKey, movable]);

    // ── Strip data ──
    const stripPlayers = useMemo(
        () =>
            players.map(p => {
                const isMe = p.userId === currentUserId;
                const inVoice = voice.peers.some(vp => vp.userId === p.userId) || (isMe && voice.inRoom);
                const muted = isMe ? voice.isMuted : (voice.peers.find(vp => vp.userId === p.userId)?.muted ?? false);
                const isOnline = p.status === 'CONNECTED' || isMe;
                const strip: PlayerStripProps & { id: string } = {
                    id: p.id,
                    color: p.color,
                    name: isMe ? 'You' : `@${p.user.username}`,
                    initials: p.user.username.slice(0, 2).toUpperCase(),
                    isActive: p.color === currentColor && room?.status === 'PLAYING',
                    dimmed: !isOnline,
                    subtitle: !isOnline
                        ? disconnectingIds.has(p.userId) ? 'reconnecting…' : 'offline'
                        : p.rank ? `#${p.rank} finished` : p.color.toLowerCase(),
                    subtitleColor: !isOnline ? '#E8A520' : p.rank ? '#37BD6A' : undefined,
                    statusIcon: inVoice ? (muted ? 'microphone-slash' : 'microphone') : undefined,
                    statusIconColor: muted ? palette.mutedText : undefined,
                };
                return strip;
            }),
        [players, currentColor, currentUserId, voice.peers, voice.inRoom, voice.isMuted, disconnectingIds, room?.status],
    );

    const topPlayers = stripPlayers.filter(p => p.color === 'RED' || p.color === 'BLUE');
    const bottomPlayers = stripPlayers.filter(p => p.color === 'GREEN' || p.color === 'YELLOW');

    const hideDialog = () => setDialog(p => ({ ...p, visible: false }));
    const showError = (title: string, message: string) =>
        setDialog({ visible: true, title, message, actions: undefined });

    async function notifyServerLeave() {
        if (!gameCode) return { ok: true as const };
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return { ok: false as const, error: 'Not signed in.' };
        return leaveRoom(token, gameCode);
    }

    const openExit = () => {
        setDialog({
            visible: true,
            title: 'Leave Game',
            message: 'You will forfeit this game and lose any progress.',
            actions: [
                { label: 'Stay', onPress: hideDialog },
                {
                    label: 'Leave',
                    onPress: () => {
                        void (async () => {
                            await notifyServerLeave();
                            voice.leave();
                            await setActiveRoom(null);
                            leftRef.current = true;
                            hideDialog();
                            router.replace('/(tabs)');
                        })();
                    },
                },
            ],
        });
    };

    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (leftRef.current) {
                leftRef.current = false;
                return;
            }
            e.preventDefault();
            openExit();
        });
        return unsub;
    }, [navigation]);

    // Win screen handlers
    const closeWin = () => {
        void (async () => {
            voice.leave();
            await setActiveRoom(null);
            leftRef.current = true;
            await notifyServerLeave();
            router.replace('/(tabs)');
        })();
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top }]}>
            {/* TOP BAR */}
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={openExit} style={styles.iconBtnSmall}>
                    <FontAwesome name="chevron-left" size={13} color={palette.mutedText} />
                </TouchableOpacity>
                <RNView style={styles.statusChip}>
                    <RNView style={[
                        styles.statusDot,
                        { backgroundColor: isRealtimeReady ? '#37BD6A' : '#E8A520' },
                    ]} />
                    <Text weight="medium" style={styles.statusText}>
                        {connectionPhase === 'connected' ? 'Live' :
                         connectionPhase === 'offline' ? 'No network' :
                         connectionPhase === 'reconnecting' ? 'Reconnecting…' :
                         connectionPhase === 'connecting' ? 'Connecting…' :
                         'Connection lost'}
                    </Text>
                </RNView>
            </RNView>

            {/* TOP STRIP */}
            {/* Strips + board, centred in the space between the top and bottom bars */}
            <RNView style={styles.arena}>
            <RNView style={styles.stripRow}>
                {topPlayers.map(p => <PlayerStrip key={p.id} {...p} />)}
            </RNView>

            {/* BOARD */}
            <RNView style={styles.boardWrap}>
                <RNView style={styles.boardShadow} />
                <LudoBoard />
                {tokenItems.map(t => (
                    <Token
                        key={t.key}
                        color={t.color}
                        coord={t.coord}
                        pos={t.pos}
                        tokenIndex={t.tokenIndex}
                        canMove={t.canMove}
                        captured={t.captured}
                        onPress={t.userId === currentUserId ? handleTokenPress : undefined}
                    />
                ))}
            </RNView>

            {/* BOTTOM STRIP */}
            <RNView style={styles.stripRow}>
                {bottomPlayers.map(p => <PlayerStrip key={p.id} {...p} />)}
            </RNView>
            </RNView>

            {/* DICE / ACTIONS */}
            <RNView style={{ paddingBottom: insets.bottom + 10 }}>
                {room?.voiceEnabled && (
                    <RNView style={styles.voiceBar}>
                        <VoiceControls roomId={roomId} compact showLeave={false} />
                    </RNView>
                )}
                <RNView style={styles.bottomBar}>
                <RNView style={styles.turnPill}>
                    <RNView style={[styles.turnDot, { backgroundColor: COLOR_HEX[currentColor] ?? '#fff' }]} />
                    <Text weight="semiBold" style={styles.turnText}>
                        {isMyTurn ? 'Your turn' : `${currentColor[0]}${currentColor.slice(1).toLowerCase()}'s turn`}
                    </Text>
                </RNView>

                <RNView style={styles.diceWrap}>
                    <RollingDice
                        value={visibleDice ?? 6}
                        rolling={rolling}
                        color={COLOR_HEX[rolling ? rollingColor ?? currentColor : currentColor] ?? '#888'}
                        waiting={canRoll}
                        disabled={!canRoll}
                        onPress={handleRollDice}
                    />
                    <Text weight="medium" style={styles.diceHint}>
                        {!isMyTurn
                            ? rolling
                                ? 'Rolling…'
                                : diceValue !== null
                                    ? 'Waiting for move…'
                                    : 'Waiting…'
                            : rolling
                                ? 'Rolling…'
                                : diceValue !== null
                                    ? 'Tap a token to move'
                                    : 'Tap to roll'}
                    </Text>
                </RNView>

                <RNView style={styles.bottomActions} />
                </RNView>
            </RNView>

            {/* Reconnecting banner */}
            {!isRealtimeReady && (
                <RNView style={[styles.banner, { top: insets.top + 8 }]}>
                    <Text weight="bold" style={styles.bannerText}>
                        {connectionPhase === 'offline' ? 'No internet — waiting for network…' :
                         connectionPhase === 'reconnecting' ? 'Reconnecting to game…' :
                         'Connecting to server…'}
                    </Text>
                </RNView>
            )}

            {/* Win overlay */}
            {winnerInfo && (
                <RNView style={styles.winOverlay}>
                    <RNView style={styles.winCard}>
                        <RNView style={[styles.winCrown, { backgroundColor: COLOR_HEX[winnerInfo.winnerColor] + '22' }]}>
                            <FontAwesome name="trophy" size={36} color={COLOR_HEX[winnerInfo.winnerColor]} />
                        </RNView>
                        <Text weight="bold" style={styles.winTitle}>
                            {winnerInfo.winnerId === currentUserId ? '🎉 You Won!' : 'Game Over'}
                        </Text>
                        <Text weight="medium" style={styles.winSub}>
                            {winnerInfo.winnerId === currentUserId
                                ? 'Champion of this round!'
                                : `Winner: ${players.find(p => p.userId === winnerInfo.winnerId)?.user.username ?? 'Unknown'}`}
                        </Text>
                        <TouchableOpacity style={styles.winBtn} onPress={closeWin} activeOpacity={0.85}>
                            <Text weight="bold" style={styles.winBtnText}>Back to Home</Text>
                        </TouchableOpacity>
                    </RNView>
                </RNView>
            )}

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

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8,
    },
    iconBtnSmall: {
        width: 36, height: 36,
        borderRadius: 10,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { fontSize: 11, color: palette.mutedText },

    stripRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },

    boardWrap: {
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        alignSelf: 'center',
        marginVertical: 4,
    },
    boardShadow: {
        position: 'absolute',
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 6, 60, 0.45)',
        top: 7,
        left: 0,
        zIndex: -1,
    },
    arena: { flex: 1, justifyContent: 'center' },


    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    turnPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: palette.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    turnDot: { width: 8, height: 8, borderRadius: 4 },
    turnText: { fontSize: 12, color: palette.text },
    voiceBar: { width: '100%', paddingHorizontal: 20, marginBottom: 8 },
    diceWrap: { alignItems: 'center', gap: 6 },
    diceHint: { fontSize: 11, color: palette.mutedText },
    bottomActions: { width: 80, height: 1 },

    banner: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: '#E8A520',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
        zIndex: 1000,
    },
    bannerText: { fontSize: 12, color: '#fff' },

    winOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
    },
    winCard: {
        width: '82%',
        backgroundColor: palette.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.border,
        paddingVertical: 28,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 14,
    },
    winCrown: {
        width: 80, height: 80,
        borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
    },
    winTitle: { fontSize: 22, color: palette.text },
    winSub: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
    winBtn: {
        marginTop: 8,
        paddingVertical: 14, paddingHorizontal: 28,
        borderRadius: 14,
        backgroundColor: '#37BD6A',
    },
    winBtnText: { color: '#fff', fontSize: 14, letterSpacing: 0.3 },
});
