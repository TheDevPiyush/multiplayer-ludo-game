import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Color } from '@ludo/engine';
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
    FadeIn,
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
import { ChatSheet } from '@/components/chat/ChatSheet';
import { ReactionBubble } from '@/components/chat/ReactionBubble';
import { ReactionPicker } from '@/components/chat/ReactionPicker';
import AppDialog from '@/components/Dialog';
import { GameTile } from '@/components/GameTile';
import { GlobeSearch } from '@/components/GlobeSearch';
import { InviteFriendsSheet } from '@/components/InviteFriendsSheet';
import { PlayerSheet, type SheetPlayer } from '@/components/PlayerSheet';
import { ColorPicker, colorOptions } from '@/components/ludo/ColorPicker';
import { COLOR_BRIGHT, COLOR_DARK, COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { useGameActions } from '@/hooks/useGameActions';
import { useGameRoom, type RoomPlayer } from '@/hooks/useGameRoom';
import { useIsGuest } from '@/hooks/useIsGuest';
import { useRoomChat, type Bubble } from '@/hooks/useRoomChat';
import { useSocket } from '@/components/SocketProvider';
import { supabase } from '@/util/supabase-client';
import { setActiveRoom } from '@/util/active-room';
import { roomInviteUrl } from '@/util/links';

const GRID_GAP = 12;
const SEAT_HEIGHT = 150;
/** 3–4 player rooms have two rows of seats; shorter tiles keep both on screen. */
const SEAT_HEIGHT_COMPACT = 118;
/** How long a color note ("someone took that", "you moved to …") stays up. */
const COLOR_NOTE_MS = 3_500;

const titleCase = (c: string) => c[0] + c.slice(1).toLowerCase();

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

type SlotData = RoomPlayer & { isHost: boolean; isMe: boolean; isOnline: boolean; muted: boolean; blocked: boolean };

/** A seated player: a tile in their colour, with their latest emote or message over it. Others' seats open them. */
function PlayerSeat({ player, width, height, bubble, onPress }: {
    player: SlotData;
    width: number;
    height: number;
    bubble?: Bubble;
    onPress?: () => void;
}) {
    return (
        <RNView style={{ width }}>
            <GameTile
                onPress={onPress}
                colors={[COLOR_BRIGHT[player.color]!, COLOR_HEX[player.color]!]}
                edge={COLOR_DARK[player.color]!}
                radius={22}
                depth={5}
                style={{ width }}
                contentStyle={[styles.seat, { height }, !player.isOnline && { opacity: 0.55 }]}
            >
                {player.isHost && (
                    <RNView style={styles.hostChip}>
                        <MaterialCommunityIcons name="crown" size={13} color="#B7791F" />
                        <Text weight="bold" style={styles.hostText}>HOST</Text>
                    </RNView>
                )}
                {player.muted && (
                    <RNView style={styles.mutedBadge} accessibilityLabel={player.blocked ? 'Blocked' : 'Muted'}>
                        <MaterialCommunityIcons name={player.blocked ? 'account-cancel' : 'block-helper'} size={13} color="rgba(255,255,255,0.9)" />
                    </RNView>
                )}

                <RNView style={styles.seatAvatar}>
                    <UserAvatar user={{ id: player.userId, ...player.user }} size={height < SEAT_HEIGHT ? 46 : 58} />
                </RNView>
                <Text weight="bold" style={styles.seatName} numberOfLines={1}>
                    {player.isMe ? 'You' : player.user.username}
                </Text>
                <Text weight="semiBold" style={styles.seatSub} numberOfLines={1}>
                    {!player.isOnline ? 'Offline' : player.isMe ? `@${player.user.username}` : 'Ready'}
                </Text>
            </GameTile>
            <ReactionBubble bubble={bubble} placement="over" />
        </RNView>
    );
}

/** An open seat: the host taps it to invite a friend; everyone else sees it waiting (or, in public rooms, searching). */
function EmptySeat({ width, height, onInvite, searching }: { width: number; height: number; onInvite?: () => void; searching?: boolean }) {
    return (
        <Pressable
            onPress={onInvite}
            disabled={!onInvite}
            style={({ pressed }) => [styles.emptySeat, { width, height: height + 5 }, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
            accessibilityLabel={onInvite ? 'Invite a friend' : 'Open seat'}
        >
            <RNView style={styles.emptyIcon}>
                <MaterialCommunityIcons name={onInvite ? 'account-plus' : searching ? 'earth' : 'account-clock'} size={26} color="#FFFFFF" />
            </RNView>
            <Text weight="bold" style={styles.emptyTitle}>{onInvite ? 'Invite' : searching ? 'Searching…' : 'Open seat'}</Text>
            {onInvite ? <Text weight="medium" style={styles.emptySub}>Tap to add a friend</Text> : <WaitingDots />}
        </Pressable>
    );
}

/** Whole seconds left on a public lobby's start countdown, timed from the server's ms-left (not the device clock). */
function useStartCountdown(msLeft: number | null | undefined, version: number | undefined): number | null {
    const [left, setLeft] = useState<number | null>(null);
    useEffect(() => {
        if (msLeft == null) {
            setLeft(null);
            return;
        }
        const endsAt = Date.now() + msLeft;
        const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
        tick();
        const t = setInterval(tick, 200);
        return () => clearInterval(t);
    }, [msLeft, version]);
    return left;
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
    const [inviteOpen, setInviteOpen] = useState(false);

    const [pendingColor, setPendingColor] = useState<Color | null>(null);
    const [colorNote, setColorNote] = useState<string | null>(null);

    const { room, joinCount, onlineUserIds, joinError } = useGameRoom({
        roomId,
        gameCode: roomCode,
        onEvent: (e) => {
            // In 2-player rooms the opponent's pick moves you to the opposite corner — say so.
            if (e.type !== 'colors' || e.byUserId === currentUserId) return;
            const mine = e.changes.find(c => c.userId === currentUserId);
            if (mine) setColorNote(`Your color is now ${titleCase(mine.to)}: 2-player games use opposite corners.`);
        },
    });
    const { startGame, chooseColor, cancelCountdown } = useGameActions(roomCode);
    const startsIn = useStartCountdown(room?.status === 'WAITING' ? room.startsInMs : null, room?.version);

    const players = room?.players ?? [];
    const chat = useRoomChat(roomId, currentUserId, joinCount);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sheetPlayer, setSheetPlayer] = useState<SheetPlayer | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const chatPlayers = useMemo(
        () => players.map(p => ({ userId: p.userId, username: p.user.username, color: p.color })),
        [players],
    );
    const openPlayer = (userId: string) => {
        const p = players.find(x => x.userId === userId);
        if (p) setSheetPlayer({ id: p.userId, username: p.user.username, avatarUrl: p.user.avatarUrl });
    };
    const selfPlayer = players.find(p => p.userId === currentUserId);
    const isHost = !!room && !!selfPlayer && selfPlayer.userId === room.createdById;
    const guest = useIsGuest();
    /** Guests have no friends to invite; the share link still works. */
    const canInvite = isHost && !guest;
    const isFull = players.length === maxPlayers;
    /** Public rooms find players (and fill up) by themselves; private ones wait for invites. */
    const isPublic = room ? !room.isPrivate : false;
    const canStart = players.length >= 2;

    const colorOpts = useMemo(
        () => (room && selfPlayer
            ? colorOptions(
                room.maxPlayers,
                players.map(p => ({ id: p.userId, color: p.color, label: p.userId === selfPlayer.userId ? 'You' : p.user.username })),
                selfPlayer.userId,
            )
            : []),
        [room, players, selfPlayer],
    );

    const handlePickColor = useCallback(async (color: Color) => {
        if (pendingColor) return;
        setPendingColor(color);
        setColorNote(null);
        const res = await chooseColor(color);
        setPendingColor(null);
        // The live update usually beats the ack; on a lost race the picker already shows the lock.
        if (!res.ok) setColorNote(res.error === 'That color is taken.' ? 'Someone just took that color.' : res.error);
    }, [pendingColor, chooseColor]);

    useEffect(() => {
        if (!colorNote) return;
        const t = setTimeout(() => setColorNote(null), COLOR_NOTE_MS);
        return () => clearTimeout(t);
    }, [colorNote]);

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
            // Public rooms carry on under another player; a private room closes with its host.
            message: isHost && room?.isPrivate
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

    const handleCancelCountdown = async () => {
        const result = await cancelCountdown();
        if (!result.ok) showError('Could not stop it', result.error);
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
            const isMe = p.userId === currentUserId;
            return {
                ...p,
                isMe,
                isHost: p.userId === room.createdById,
                isOnline: onlineUserIds.includes(p.userId) || isMe,
                muted: chat.muted.has(p.userId),
                blocked: chat.blocked.has(p.userId),
            };
        });
    }, [room, players, onlineUserIds, currentUserId, chat.muted, chat.blocked]);

    const slots = useMemo<(SlotData | null)[]>(
        () => Array.from({ length: maxPlayers }, (_, i) => slotData[i] ?? null),
        [slotData, maxPlayers],
    );

    const { width: screenW } = useWindowDimensions();
    const seatW = (screenW - 36 - GRID_GAP) / 2;
    const seatH = maxPlayers > 2 ? SEAT_HEIGHT_COMPACT : SEAT_HEIGHT;
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
                    <Text weight="bold" style={styles.title}>{isPublic ? 'Public lobby' : 'Room lobby'}</Text>
                    <RNView style={styles.connRow}>
                        <RNView style={[styles.connDot, { backgroundColor: connColor }]} />
                        <Text weight="medium" style={styles.connText}>{connectionLabel(connectionPhase)}</Text>
                    </RNView>
                </RNView>
                <RNView style={styles.headerBtns}>
                    <Pressable
                        onPress={() => setPickerOpen(true)}
                        disabled={!isRealtimeReady || !room}
                        style={({ pressed }) => [styles.roundBtn, pressed && { transform: [{ scale: 0.92 }] }]}
                        hitSlop={4}
                        accessibilityLabel="Emotes and quick replies"
                    >
                        <MaterialCommunityIcons name="emoticon-happy-outline" size={23} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                        onPress={() => setChatOpen(true)}
                        style={({ pressed }) => [styles.roundBtn, pressed && { transform: [{ scale: 0.92 }] }]}
                        hitSlop={4}
                        accessibilityLabel="Room chat"
                    >
                        <MaterialCommunityIcons name="chat-processing-outline" size={22} color="#FFFFFF" />
                        {chat.unread > 0 && (
                            <RNView style={styles.unread}>
                                <Text weight="bold" style={styles.unreadText}>{chat.unread > 9 ? '9+' : chat.unread}</Text>
                            </RNView>
                        )}
                    </Pressable>
                </RNView>
            </RNView>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Room code: public rooms show the search instead, with the code and share link still there */}
                {isPublic ? (
                    <Animated.View entering={FadeInDown.duration(380)}>
                        <GameTile colors={['#4F46F0', '#3730D6']} edge="#241C9E" radius={26} depth={6} contentStyle={styles.publicCard}>
                            <GlobeSearch size={78} searching={!isFull} />
                            <RNView style={styles.publicInfo}>
                                <RNView style={styles.codeTop}>
                                    <Text weight="bold" style={styles.codeLabel}>PUBLIC ROOM</Text>
                                    <RNView style={styles.countChip}>
                                        <MaterialCommunityIcons name="account-group" size={14} color="#FFFFFF" />
                                        <Text weight="bold" style={styles.countText}>{players.length}/{maxPlayers}</Text>
                                    </RNView>
                                </RNView>
                                <Text weight="bold" style={styles.publicTitle}>
                                    {isFull ? 'Table’s full. Let’s play!' : 'Finding players around the globe'}
                                </Text>
                                <RNView style={styles.publicActions}>
                                    <Pressable onPress={copyCode} style={styles.publicCode} hitSlop={6} accessibilityLabel="Copy room code">
                                        <Text weight="bold" style={styles.publicCodeText} numberOfLines={1}>{roomCode || '——'}</Text>
                                        <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={14} color="#FFFFFF" />
                                    </Pressable>
                                    <Pressable
                                        onPress={shareInvite}
                                        style={({ pressed }) => [styles.publicShare, pressed && { transform: [{ scale: 0.95 }] }]}
                                        hitSlop={6}
                                        accessibilityLabel="Share invite link"
                                    >
                                        <MaterialCommunityIcons name="share-variant" size={15} color="#3B3BE8" />
                                        <Text weight="bold" style={styles.publicShareText}>Share</Text>
                                    </Pressable>
                                </RNView>
                            </RNView>
                        </GameTile>
                    </Animated.View>
                ) : (
                    <Animated.View entering={FadeInDown.duration(380)}>
                        <GameTile colors={['#FF5A5F', '#FF8A3D']} edge="#C2304A" radius={26} depth={6} contentStyle={styles.codeCard}>
                            <RNView style={styles.codeTop}>
                                <Text weight="bold" style={styles.codeLabel}>ROOM CODE</Text>
                                <RNView style={styles.countChip}>
                                    <MaterialCommunityIcons name="account-group" size={14} color="#FFFFFF" />
                                    <Text weight="bold" style={styles.countText}>{players.length}/{maxPlayers}</Text>
                                </RNView>
                            </RNView>
                            <RNView style={styles.codeRow}>
                                <Pressable onPress={copyCode} style={styles.codeCopy} hitSlop={6} accessibilityLabel="Copy room code">
                                    <Text weight="bold" style={styles.code} numberOfLines={1} adjustsFontSizeToFit>{roomCode || '——'}</Text>
                                    <RNView style={styles.copyBtn}>
                                        <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={16} color="#FFFFFF" />
                                    </RNView>
                                </Pressable>
                                <GameTile
                                    colors={['#FFFFFF', '#FFF1EC']}
                                    edge="#E2A895"
                                    radius={14}
                                    depth={4}
                                    onPress={shareInvite}
                                    contentStyle={styles.shareBtn}
                                >
                                    <MaterialCommunityIcons name="share-variant" size={17} color="#E2364A" />
                                    <Text weight="bold" style={styles.shareText}>Share</Text>
                                </GameTile>
                            </RNView>
                        </GameTile>
                    </Animated.View>
                )}

                {/* Color */}
                {/* Who holds which color shows on the seat tiles below, so the dots need no names. */}
                {selfPlayer && room?.status === 'WAITING' && (
                    <Animated.View entering={FadeInDown.delay(40).duration(380)} style={styles.colorCard}>
                        <RNView style={styles.colorRow}>
                            <Text weight="bold" style={styles.colorTitle}>Your color</Text>
                            <RNView style={{ flex: 1 }}>
                                <ColorPicker
                                    options={colorOpts}
                                    onPick={handlePickColor}
                                    pending={pendingColor}
                                    disabled={!isRealtimeReady}
                                    size={32}
                                    showLabels={false}
                                />
                            </RNView>
                        </RNView>
                        <Text
                            weight="medium"
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={[styles.colorHint, colorNote ? styles.colorNote : null]}
                        >
                            {colorNote ?? (room.maxPlayers === 2
                                ? 'Opposite corners in 2-player games: your opponent moves too.'
                                : 'Tap a free color to switch. Locked ones are taken.')}
                        </Text>
                    </Animated.View>
                )}

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
                                    height={seatH}
                                    bubble={chat.bubbles[player.userId]}
                                    onPress={player.isMe ? undefined : () => openPlayer(player.userId)}
                                />
                            ) : (
                                <EmptySeat
                                    key={`empty-${i}`}
                                    width={seatW}
                                    height={seatH}
                                    onInvite={canInvite ? () => setInviteOpen(true) : undefined}
                                    searching={isPublic}
                                />
                            ),
                        )}
                    </RNView>
                </Animated.View>
            </ScrollView>

            {/* Start / waiting */}
            <RNView style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
                {startsIn !== null ? (
                    <Animated.View entering={FadeIn.duration(200)} style={styles.countPanel}>
                        <Animated.View key={startsIn} entering={FadeInDown.duration(220)} style={styles.countBadge}>
                            <Text weight="bold" style={styles.countNum}>{startsIn > 0 ? startsIn : '…'}</Text>
                        </Animated.View>
                        <Text weight="semiBold" style={[styles.waitText, { flex: 1 }]}>
                            {startsIn > 0 ? 'Game starting' : 'Starting…'}
                        </Text>
                        {isHost && startsIn > 0 && (
                            <Pressable
                                onPress={() => void handleCancelCountdown()}
                                style={({ pressed }) => [styles.countCancel, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
                                hitSlop={6}
                                accessibilityLabel="Stop the countdown"
                            >
                                <Text weight="bold" style={styles.countCancelText}>Cancel</Text>
                            </Pressable>
                        )}
                    </Animated.View>
                ) : isHost ? (
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
                        <Text weight="semiBold" style={styles.waitText}>
                            {isPublic ? (isFull ? 'Starting soon' : 'Waiting for more players') : 'Waiting for the host to start'}
                        </Text>
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

            <ReactionPicker
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onPick={chat.react}
                anchor={{ top: insets.top + 62, right: 18 }}
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
    headerBtns: { flexDirection: 'row', gap: 8 },
    unread: {
        position: 'absolute',
        top: -3,
        right: -3,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF4D5E',
    },
    unreadText: { fontSize: 10, color: '#FFFFFF' },

    scroll: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16, gap: 16 },

    codeCard: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
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
    codeCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    code: { flexShrink: 1, fontSize: 34, color: '#FFFFFF', letterSpacing: 4, fontFamily: 'SpaceMono-Regular' },
    copyBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, paddingHorizontal: 14 },
    shareText: { fontSize: 15, color: '#E2364A' },

    publicCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 2, paddingRight: 16 },
    publicInfo: { flex: 1, gap: 6 },
    publicTitle: { fontSize: 17, lineHeight: 22, color: '#FFFFFF' },
    publicActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    publicCode: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: 10,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    publicCodeText: { flexShrink: 1, fontSize: 15, color: '#FFFFFF', letterSpacing: 2, fontFamily: 'SpaceMono-Regular' },
    publicShare: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#FFFFFF' },
    publicShareText: { fontSize: 13, color: '#3B3BE8' },

    section: { fontSize: 15, color: '#FFFFFF' },
    colorCard: {
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    colorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    colorTitle: { fontSize: 14, color: '#FFFFFF' },
    colorHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
    colorNote: { color: '#FFE08A' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
    seat: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 10 },
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
    mutedBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.22)',
    },

    emptySeat: {
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
    countPanel: {
        height: 60,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    countBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E' },
    countNum: { fontSize: 22, color: '#FFFFFF' },
    countCancel: { height: 40, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    countCancelText: { fontSize: 14, color: '#E2364A' },
});
