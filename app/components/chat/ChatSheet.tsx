import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CHAT_MAX_LENGTH } from '@ludo/engine';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View as RNView,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import { Fonts } from '@/constants/fonts';
import type { ChatMessage, RoomChat } from '@/hooks/useRoomChat';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const RED = '#E2364A';
const TRACK = '#F1F0FA';

export type ChatPlayer = { userId: string; username: string; color: string };

function mmss(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Counts down to `until`, once a second. */
function useRemaining(until: number | null): number {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!until) return;
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [until]);
    return until ? Math.max(0, until - now) : 0;
}

/**
 * The room's text chat, plus muting players (their emotes and messages are
 * hidden on this phone). Tapping a name opens that player (`onPlayerPress`).
 */
export function ChatSheet({ visible, onClose, chat, players, currentUserId, onPlayerPress }: {
    visible: boolean;
    onClose: () => void;
    chat: RoomChat;
    players: ChatPlayer[];
    currentUserId: string | null;
    onPlayerPress?: (userId: string) => void;
}) {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const listRef = useRef<FlatList<ChatMessage>>(null);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [muteNote, setMuteNote] = useState<string | null>(null);
    const lockLeft = useRemaining(chat.lockedUntil);
    const { setSheetOpen } = chat;

    useEffect(() => {
        setSheetOpen(visible);
    }, [visible, setSheetOpen]);

    useEffect(() => {
        if (!error) return;
        const t = setTimeout(() => setError(null), 3_000);
        return () => clearTimeout(t);
    }, [error]);

    useEffect(() => {
        if (!muteNote) return;
        const t = setTimeout(() => setMuteNote(null), 2_500);
        return () => clearTimeout(t);
    }, [muteNote]);

    const toggleMute = (p: ChatPlayer) => {
        if (chat.blocked.has(p.userId)) {
            setMuteNote(`@${p.username} is blocked. Tap their seat to unblock.`);
            return;
        }
        const muting = !chat.mutedHere.has(p.userId);
        chat.toggleMute(p.userId);
        setMuteNote(`@${p.username}’s messages are ${muting ? 'muted' : 'unmuted'} for you.`);
    };

    const byId = useMemo(() => new Map(players.map(p => [p.userId, p])), [players]);
    const others = players.filter(p => p.userId !== currentUserId);
    const shown = chat.messages.filter(m => !chat.muted.has(m.userId));

    const send = async () => {
        const text = draft.trim();
        if (!text || sending) return;
        setSending(true);
        const res = await chat.send(text);
        setSending(false);
        if (res.ok) setDraft('');
        else setError(res.error);
    };

    const renderMessage = ({ item }: { item: ChatMessage }) => {
        const mine = item.userId === currentUserId;
        const p = byId.get(item.userId);
        return (
            <RNView style={[styles.msgRow, mine && styles.msgRowMine]}>
                <RNView style={[styles.msg, mine ? styles.msgMine : styles.msgTheirs]}>
                    {!mine && (
                        <Pressable
                            onPress={onPlayerPress && p ? () => onPlayerPress(item.userId) : undefined}
                            style={styles.msgHead}
                            hitSlop={6}
                            accessibilityLabel={p ? `@${p.username}: block or report` : undefined}
                        >
                            <RNView style={[styles.dot, { backgroundColor: COLOR_HEX[p?.color ?? ''] ?? MUTED }]} />
                            <Text weight="bold" style={styles.msgName} numberOfLines={1}>@{p?.username ?? 'player'}</Text>
                        </Pressable>
                    )}
                    <Text weight="medium" style={[styles.msgText, mine && { color: '#FFFFFF' }]}>{item.text}</Text>
                </RNView>
            </RNView>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            {/* Android's modal window resizes for the keyboard itself. */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
                    <Animated.View entering={FadeIn.duration(180)} style={styles.scrim} />
                </Pressable>
                <Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
                    <RNView style={styles.grabber} />
                    <RNView style={styles.titleRow}>
                        <RNView style={{ flex: 1 }}>
                            <Text weight="bold" style={styles.title}>Room chat</Text>
                            <Text weight="medium" style={styles.subtitle}>Keep it friendly: a foul word locks your chat for 2 minutes.</Text>
                        </RNView>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
                            <MaterialCommunityIcons name="close" size={20} color={MUTED} />
                        </Pressable>
                    </RNView>

                    {others.length > 0 && (
                        <RNView style={styles.muteBox}>
                            <Text weight="bold" style={styles.muteTitle}>Mute a player</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muteRow}>
                                {others.map(p => {
                                    const isBlocked = chat.blocked.has(p.userId);
                                    const isMuted = isBlocked || chat.mutedHere.has(p.userId);
                                    return (
                                        <Pressable
                                            key={p.userId}
                                            onPress={() => toggleMute(p)}
                                            style={({ pressed }) => [styles.muteBtn, isMuted && styles.muteBtnOn, pressed && { opacity: 0.8 }]}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: isMuted }}
                                            accessibilityLabel={isBlocked ? `${p.username} is blocked` : isMuted ? `Unmute ${p.username}` : `Mute ${p.username}`}
                                        >
                                            <MaterialCommunityIcons name={isBlocked ? 'account-cancel' : 'block-helper'} size={14} color={isMuted ? '#FFFFFF' : RED} />
                                            <Text
                                                weight="bold"
                                                style={[styles.muteText, isMuted && { color: '#FFFFFF' }]}
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                            >
                                                {p.username}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                            <Text weight="medium" style={styles.muteNote} numberOfLines={2}>
                                {muteNote ?? 'Muted players’ messages and emotes are hidden for you only. Tap a player’s seat or name to block or report.'}
                            </Text>
                        </RNView>
                    )}

                    <FlatList
                        ref={listRef}
                        data={shown}
                        keyExtractor={m => m.id}
                        renderItem={renderMessage}
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <RNView style={styles.empty}>
                                <MaterialCommunityIcons name="chat-outline" size={30} color="#C9CBE3" />
                                <Text weight="medium" style={styles.emptyText}>No messages yet. Say hi!</Text>
                            </RNView>
                        }
                    />

                    {!chat.canChat ? (
                        <Pressable
                            onPress={() => {
                                onClose();
                                router.navigate('/(tabs)/profile');
                            }}
                            style={({ pressed }) => [styles.notice, pressed && { opacity: 0.85 }]}
                        >
                            <MaterialCommunityIcons name="content-save" size={18} color={INDIGO} />
                            <Text weight="bold" style={[styles.noticeText, { color: INDIGO }]}>Save your progress to chat</Text>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={INDIGO} />
                        </Pressable>
                    ) : lockLeft > 0 ? (
                        <RNView style={[styles.notice, styles.noticeLocked]}>
                            <MaterialCommunityIcons name="lock-clock" size={18} color={RED} />
                            <Text weight="bold" style={[styles.noticeText, { color: RED }]}>
                                Chat locked for a foul word · {mmss(lockLeft)}
                            </Text>
                        </RNView>
                    ) : (
                        <>
                            <RNView style={styles.inputRow}>
                                <TextInput
                                    value={draft}
                                    onChangeText={setDraft}
                                    placeholder="Message the room"
                                    placeholderTextColor="#A3A7C7"
                                    maxLength={CHAT_MAX_LENGTH}
                                    returnKeyType="send"
                                    onSubmitEditing={() => void send()}
                                    submitBehavior="submit"
                                    style={styles.input}
                                />
                                <Pressable
                                    onPress={() => void send()}
                                    disabled={!draft.trim() || sending}
                                    style={({ pressed }) => [styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.92 }] }]}
                                    accessibilityLabel="Send"
                                >
                                    {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />}
                                </Pressable>
                            </RNView>
                            {error && <Text weight="semiBold" style={styles.error}>{error}</Text>}
                        </>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    scrim: { flex: 1, backgroundColor: 'rgba(10, 8, 50, 0.55)' },
    sheet: {
        height: '70%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDEB', marginTop: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12, marginBottom: 12 },
    title: { fontSize: 22, color: INK },
    subtitle: { fontSize: 12, color: MUTED, marginTop: 2 },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },

    muteBox: { padding: 12, borderRadius: 18, backgroundColor: TRACK, marginBottom: 8, gap: 8 },
    muteTitle: { fontSize: 11, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
    muteRow: { gap: 8 },
    muteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: 150,
        paddingHorizontal: 12,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#F3C4CA',
    },
    muteBtnOn: { backgroundColor: RED, borderColor: RED },
    muteText: { flexShrink: 1, fontSize: 13, color: INK },
    muteNote: { fontSize: 11, color: MUTED },
    dot: { width: 8, height: 8, borderRadius: 4 },

    list: { flex: 1 },
    listContent: { paddingVertical: 8, gap: 6, flexGrow: 1 },
    msgRow: { flexDirection: 'row' },
    msgRowMine: { justifyContent: 'flex-end' },
    msg: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
    msgTheirs: { backgroundColor: TRACK, borderBottomLeftRadius: 4 },
    msgMine: { backgroundColor: INDIGO, borderBottomRightRadius: 4 },
    msgHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
    msgName: { fontSize: 11, color: MUTED },
    msgText: { fontSize: 14, lineHeight: 19, color: INK },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
    emptyText: { fontSize: 13, color: MUTED },

    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    input: {
        flex: 1,
        height: 46,
        paddingHorizontal: 16,
        borderRadius: 23,
        backgroundColor: TRACK,
        fontSize: 15,
        color: INK,
        fontFamily: Fonts.semiBold,
    },
    sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: INDIGO },
    error: { fontSize: 12, color: RED, marginTop: 6, marginLeft: 6 },
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        marginTop: 6,
        borderRadius: 23,
        backgroundColor: '#ECEBFF',
    },
    noticeLocked: { backgroundColor: '#FDECEE' },
    noticeText: { fontSize: 14 },
});
