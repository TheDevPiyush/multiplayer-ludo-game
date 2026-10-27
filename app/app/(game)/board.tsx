import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import { ChatSheet } from '@/components/chat/ChatSheet';
import { ReactionBubble } from '@/components/chat/ReactionBubble';
import { ReactionPicker } from '@/components/chat/ReactionPicker';
import AppDialog from '@/components/Dialog';
import { RollingDice } from '@/components/ludo/Dice';
import { BOARD_SIZE, COLOR_HEX, layoutTokens, stripRows, turnsFor } from '@/components/ludo/geometry';
import { LudoBoard } from '@/components/ludo/LudoBoard';
import { PlayerStrip, type PlayerStripProps } from '@/components/ludo/PlayerStrip';
import { PlayerSheet, type SheetPlayer } from '@/components/PlayerSheet';
import { Token } from '@/components/ludo/Token';
import type { TurnDeadline } from '@/components/ludo/TurnTimer';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom } from '@/hooks/useGameRoom';
import { useRoomChat } from '@/hooks/useRoomChat';
import { markHistoryStale } from '@/util/history-cache';
import { useSocket } from '@/components/SocketProvider';
import { setActiveRoom } from '@/util/active-room';
import { playEffect } from '@/util/audio';
import { feedbackForEvents, haptic } from '@/util/feedback';
import { supabase } from '@/util/supabase-client';


const ROLL_ANIM_MS = 800;
/** Autopilot turns for offline players (~2.5 s) are too short to be worth a ring. */
const MIN_TIMER_RING_MS = 4_000;
/** The last seconds of your turn tick (sound + haptic) before autopilot plays. */
const TICK_SECONDS = 5;

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
    const [pickerOpen, setPickerOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [sheetPlayer, setSheetPlayer] = useState<SheetPlayer | null>(null);
    const [dialog, setDialog] = useState({
        visible: false, title: '', message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const leftRef = useRef(false);
    const rollingRef = useRef(false);
    const currentUserIdRef = useRef<string | null>(null);
    /** This player's color, for sounds fired from socket callbacks. */
    const myColorRef = useRef<string | null>(null);
    const runRollAnimationRef = useRef<(finalValue: number, rollerColor: string) => Promise<void>>(
        async () => {},
    );
    currentUserIdRef.current = currentUserId;
    rollingRef.current = rolling;

    const { room, joinCount } = useGameRoom({
        roomId,
        gameCode,
        onEvents: (events) => feedbackForEvents(events, color => color === myColorRef.current),
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
    const chat = useRoomChat(roomId, currentUserId, joinCount);
    const chatPlayers = useMemo(
        () => players.map(p => ({ userId: p.userId, username: p.user.username, color: p.color })),
        [players],
    );
    const openPlayer = (userId: string) => {
        const p = players.find(x => x.userId === userId);
        if (p && userId !== currentUserId) setSheetPlayer({ id: p.userId, username: p.user.username, avatarUrl: p.user.avatarUrl });
    };
    const currentColor = room?.currentTurnColor ?? 'RED';
    const diceValue = room?.currentDice ?? null;

    const selfPlayer = useMemo(
        () => players.find(p => p.userId === currentUserId),
        [players, currentUserId],
    );

    const isMyTurn = !!selfPlayer && selfPlayer.color === currentColor && room?.status === 'PLAYING';
    myColorRef.current = selfPlayer?.color ?? null;

    // Music has faded out with the lobby; the game opens with its intro, once.
    useEffect(() => playEffect('intro'), []);

    // The server restarts the turn timer whenever `turnEndsAt` changes; time it from
    // `turnMsLeft` on arrival so a phone with a wrong clock still counts down right.
    const turnEndsAt = room?.turnEndsAt ?? null;
    const turnDeadline = useMemo<TurnDeadline | null>(() => {
        const left = room?.turnMsLeft;
        if (turnEndsAt === null || left == null || left < MIN_TIMER_RING_MS) return null;
        return { endsAt: Date.now() + left, totalMs: left };
    }, [turnEndsAt]);

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

    // Remember every rolled value so it stays visible after the turn advances.
    useEffect(() => {
        if (diceValue !== null) setLastShownDice(diceValue);
    }, [diceValue]);

    // Countdown ticks in the last seconds of your own turn.
    useEffect(() => {
        if (!isMyTurn || !turnDeadline) return;
        const timers: ReturnType<typeof setTimeout>[] = [];
        for (let s = TICK_SECONDS; s >= 1; s--) {
            const wait = turnDeadline.endsAt - s * 1000 - Date.now();
            if (wait < 0) continue;
            timers.push(setTimeout(() => {
                playEffect('tick');
                haptic.tick();
            }, wait));
        }
        return () => timers.forEach(clearTimeout);
    }, [isMyTurn, turnDeadline]);

    // ── Dice animation ──
    const runRollAnimation = useCallback(async (finalValue: number, rollerColor: string) => {
        if (rollingRef.current) return;

        playEffect('roll');
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

        playEffect('roll');
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
            haptic.medium();
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

    // Stable identity so memoised tokens don't re-render on every update; reads the latest state from a ref.
    const pressStateRef = useRef({ isMyTurn, diceValue, selfPlayer, movable, moveToken });
    pressStateRef.current = { isMyTurn, diceValue, selfPlayer, movable, moveToken };
    const handleTokenPress = useCallback(async (tokenIndex: number) => {
        const s = pressStateRef.current;
        if (!s.isMyTurn || s.diceValue === null || !s.selfPlayer) return;
        if (!s.movable.includes(tokenIndex)) return;
        await s.moveToken(tokenIndex);
    }, []);

    /** Turns the board so your own home is bottom-right on your phone. */
    const myColor = players.find(p => p.userId === currentUserId)?.color;
    const turns = turnsFor(myColor);

    // Token coords & stacking
    const tokenItems = useMemo(() => {
        const layout = layoutTokens(players.map(p => ({ color: p.color, tokens: p.tokenPositions ?? [], owner: p.userId })), turns);
        return layout.map(t => ({
            ...t,
            userId: t.owner,
            canMove: isMyTurn && t.owner === currentUserId && diceValue !== null && movable.includes(t.tokenIndex),
            captured: !!capturedKey && capturedKey.startsWith(`${t.owner}:${t.tokenIndex}:`) && t.pos === 0,
        }));
    }, [players, isMyTurn, diceValue, currentUserId, capturedKey, movable, turns]);

    // ── Strip data ──
    const stripPlayers = useMemo(
        () =>
            players.map(p => {
                const isMe = p.userId === currentUserId;
                const muted = chat.muted.has(p.userId);
                const blocked = chat.blocked.has(p.userId);
                const isOnline = p.status === 'CONNECTED' || isMe;
                const strip: PlayerStripProps & { id: string; userId: string } = {
                    id: p.id,
                    userId: p.userId,
                    color: p.color,
                    name: isMe ? 'You' : `@${p.user.username}`,
                    initials: p.user.username.slice(0, 2).toUpperCase(),
                    isActive: p.color === currentColor && room?.status === 'PLAYING',
                    dimmed: !isOnline,
                    subtitle: !isOnline
                        ? disconnectingIds.has(p.userId) ? 'reconnecting…' : 'offline'
                        : p.rank ? `#${p.rank} finished` : p.color.toLowerCase(),
                    subtitleColor: !isOnline ? '#E8A520' : p.rank ? '#37BD6A' : undefined,
                    statusIcon: blocked ? 'user-times' : muted ? 'ban' : undefined,
                    statusIconColor: muted ? palette.mutedText : undefined,
                    turnDeadline: p.color === currentColor ? turnDeadline : null,
                };
                return strip;
            }),
        [players, currentColor, currentUserId, chat.muted, chat.blocked, disconnectingIds, room?.status, turnDeadline],
    );

    // Each strip sits at its own home's corner (an empty cell keeps the other side in place).
    const [topPlayers, bottomPlayers] = stripRows(stripPlayers, turns);

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
                <TouchableOpacity onPress={() => setChatOpen(true)} style={styles.iconBtnSmall} accessibilityLabel="Room chat">
                    <MaterialCommunityIcons name="chat-processing-outline" size={18} color={palette.text} />
                    {chat.unread > 0 && (
                        <RNView style={styles.unread}>
                            <Text weight="bold" style={styles.unreadText}>{chat.unread > 9 ? '9+' : chat.unread}</Text>
                        </RNView>
                    )}
                </TouchableOpacity>
            </RNView>

            {/* TOP STRIP */}
            {/* Strips + board, centred in the space between the top and bottom bars */}
            <RNView style={styles.arena}>
            <RNView style={styles.stripRow}>
                {topPlayers.map((p, i) => p ? (
                    <Pressable key={p.id} style={styles.stripCell} onPress={() => openPlayer(p.userId)} disabled={p.userId === currentUserId}>
                        <PlayerStrip {...p} />
                        <ReactionBubble bubble={chat.bubbles[p.userId]} placement="below" />
                    </Pressable>
                ) : <RNView key={`empty-${i}`} style={styles.stripCell} />)}
            </RNView>

            {/* BOARD */}
            <RNView style={styles.boardWrap}>
                <RNView style={styles.boardShadow} />
                <LudoBoard turns={turns} />
                {tokenItems.map(t => (
                    <Token
                        turns={turns}
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
                {bottomPlayers.map((p, i) => p ? (
                    <Pressable key={p.id} style={styles.stripCell} onPress={() => openPlayer(p.userId)} disabled={p.userId === currentUserId}>
                        <PlayerStrip {...p} />
                        <ReactionBubble bubble={chat.bubbles[p.userId]} placement="above" />
                    </Pressable>
                ) : <RNView key={`empty-${i}`} style={styles.stripCell} />)}
            </RNView>
            </RNView>

            {/* DICE / ACTIONS */}
            <RNView style={{ paddingBottom: insets.bottom + 10 }}>
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

                <RNView style={styles.bottomActions}>
                    <TouchableOpacity
                        onPress={() => setPickerOpen(true)}
                        disabled={!isRealtimeReady}
                        style={[styles.emoteBtn, !isRealtimeReady && { opacity: 0.5 }]}
                        activeOpacity={0.8}
                        accessibilityLabel="Emotes and quick replies"
                    >
                        <MaterialCommunityIcons name="emoticon-happy-outline" size={26} color="#FFFFFF" />
                    </TouchableOpacity>
                </RNView>
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

            <ReactionPicker
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onPick={chat.react}
                anchor={{ bottom: insets.bottom + 92, right: 14 }}
            />
            <ChatSheet
                visible={chatOpen}
                onClose={() => setChatOpen(false)}
                chat={chat}
                players={chatPlayers}
                currentUserId={currentUserId}
                onPlayerPress={userId => {
                    setChatOpen(false);
                    openPlayer(userId);
                }}
            />
            <PlayerSheet
                player={sheetPlayer}
                onClose={() => setSheetPlayer(null)}
                roomId={roomId}
                muted={!!sheetPlayer && chat.mutedHere.has(sheetPlayer.id)}
                onToggleMute={sheetPlayer ? () => chat.toggleMute(sheetPlayer.id) : undefined}
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
        // Reaction bubbles overlap the board.
        zIndex: 10,
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
    diceWrap: { alignItems: 'center', gap: 6 },
    diceHint: { fontSize: 11, color: palette.mutedText },
    bottomActions: { width: 80, alignItems: 'flex-end' },
    emoteBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.28)',
    },
    /** Holds a strip (it flexes along the row) and its reaction bubble. */
    stripCell: { flex: 1, flexDirection: 'row' },
    unread: {
        position: 'absolute',
        top: -5,
        right: -5,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF4D5E',
    },
    unreadText: { fontSize: 10, color: '#FFFFFF' },

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
