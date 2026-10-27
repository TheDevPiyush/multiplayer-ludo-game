import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    TextInput,
    View as RNView,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reportUser, type ReportReason } from '@/apis/social-api';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { Fonts } from '@/constants/fonts';
import { blockPlayer, unblockPlayer, useBlockedIds } from '@/hooks/useBlocks';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const RED = '#E2364A';
const TRACK = '#F1F0FA';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type SheetPlayer = { id: string; username: string; avatarUrl: string | null };

const REASONS: { key: ReportReason; label: string; icon: IconName }[] = [
    { key: 'abuse', label: 'Abusive chat or emotes', icon: 'message-alert-outline' },
    { key: 'cheating', label: 'Cheating or stalling the game', icon: 'timer-sand' },
    { key: 'username', label: 'Offensive username or photo', icon: 'account-alert-outline' },
    { key: 'other', label: 'Something else', icon: 'dots-horizontal-circle-outline' },
];
const NOTE_MAX = 500;

type View = 'main' | 'block' | 'report' | 'reported';

/**
 * Another player, from a seat, a chat message or the friends list: mute them
 * in this room (when `onToggleMute` is given), block, or report them.
 */
export function PlayerSheet({ player, onClose, roomId, muted, onToggleMute }: {
    player: SheetPlayer | null;
    onClose: () => void;
    /** The room they're seen in: a report from here includes their messages in it. */
    roomId?: string;
    muted?: boolean;
    onToggleMute?: () => void;
}) {
    const insets = useSafeAreaInsets();
    const blockedIds = useBlockedIds();
    const [view, setView] = useState<View>('main');
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [note, setNote] = useState('');
    const [alsoBlock, setAlsoBlock] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [blockedByReport, setBlockedByReport] = useState(false);

    // Each player starts fresh.
    useEffect(() => {
        setView('main');
        setReason(null);
        setNote('');
        setAlsoBlock(true);
        setBusy(false);
        setError(null);
        setBlockedByReport(false);
    }, [player?.id]);

    if (!player) return null;
    const isBlocked = blockedIds.has(player.id);
    const name = `@${player.username}`;

    const block = async () => {
        setBusy(true);
        setError(null);
        const res = await blockPlayer(player.id);
        setBusy(false);
        if (res.ok) setView('main');
        else setError(res.error ?? 'Could not block. Try again.');
    };

    const unblock = async () => {
        setBusy(true);
        setError(null);
        const res = await unblockPlayer(player.id);
        setBusy(false);
        if (!res.ok) setError(res.error ?? 'Could not unblock. Try again.');
    };

    const sendReport = async () => {
        if (!reason) return;
        setBusy(true);
        setError(null);
        const res = await reportUser({ userId: player.id, reason, note: note.trim() || undefined, roomId });
        if (!res.ok) {
            setBusy(false);
            setError(res.error);
            return;
        }
        const blockToo = alsoBlock && !isBlocked;
        if (blockToo) await blockPlayer(player.id);
        setBusy(false);
        setBlockedByReport(blockToo);
        setView('reported');
    };

    const header = (title: string, back?: boolean) => (
        <RNView style={styles.titleRow}>
            {back && (
                <Pressable onPress={() => { setView('main'); setError(null); }} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Back">
                    <MaterialCommunityIcons name="arrow-left" size={20} color={MUTED} />
                </Pressable>
            )}
            <Text weight="bold" style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={MUTED} />
            </Pressable>
        </RNView>
    );

    return (
        <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
                    <Animated.View entering={FadeIn.duration(180)} style={styles.scrim} />
                </Pressable>
                <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                    <RNView style={styles.grabber} />

                    {view === 'main' && (
                        <>
                            <RNView style={styles.profile}>
                                <UserAvatar user={player} size={56} />
                                <RNView style={{ flex: 1 }}>
                                    <Text weight="bold" style={styles.name} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
                                    {isBlocked && (
                                        <RNView style={styles.blockedChip}>
                                            <MaterialCommunityIcons name="account-cancel" size={13} color={RED} />
                                            <Text weight="bold" style={styles.blockedChipText}>Blocked</Text>
                                        </RNView>
                                    )}
                                </RNView>
                                <Pressable onPress={onClose} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Close">
                                    <MaterialCommunityIcons name="close" size={20} color={MUTED} />
                                </Pressable>
                            </RNView>

                            <RNView style={styles.card}>
                                {onToggleMute && !isBlocked && (
                                    <>
                                        <ActionRow
                                            icon="block-helper"
                                            label={muted ? 'Unmute in this room' : 'Mute in this room'}
                                            sub={muted ? 'Their messages and emotes are hidden for you.' : 'Hide their messages and emotes in this game.'}
                                            onPress={onToggleMute}
                                        />
                                        <RNView style={styles.separator} />
                                    </>
                                )}
                                <ActionRow
                                    icon="account-cancel"
                                    label={isBlocked ? 'Unblock' : 'Block'}
                                    sub={isBlocked ? 'You can see each other’s emotes and chat again.' : 'Everywhere, in every game.'}
                                    danger={!isBlocked}
                                    busy={busy && isBlocked}
                                    onPress={() => (isBlocked ? void unblock() : setView('block'))}
                                />
                                <RNView style={styles.separator} />
                                <ActionRow
                                    icon="flag-outline"
                                    label="Report"
                                    sub="Abuse, cheating or an offensive name."
                                    danger
                                    onPress={() => setView('report')}
                                />
                            </RNView>
                            {error && <Text weight="semiBold" style={styles.error}>{error}</Text>}
                        </>
                    )}

                    {view === 'block' && (
                        <>
                            {header(`Block ${name}?`, true)}
                            <RNView style={styles.points}>
                                <Point icon="message-off-outline" text="You won’t see each other’s emotes or chat." />
                                <Point icon="account-remove-outline" text="They can’t send you friend requests or invites, and you’ll stop being friends." />
                                <Point icon="eye-off-outline" text="They aren’t told. You can unblock them from Profile." />
                            </RNView>
                            {error && <Text weight="semiBold" style={styles.error}>{error}</Text>}
                            <Pressable
                                onPress={() => void block()}
                                disabled={busy}
                                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: RED }, pressed && styles.pressed]}
                            >
                                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text weight="bold" style={styles.primaryText}>Block</Text>}
                            </Pressable>
                        </>
                    )}

                    {view === 'report' && (
                        <>
                            {header(`Report ${name}`, true)}
                            <Text weight="medium" style={styles.hint}>
                                What happened?{roomId ? ' Their recent messages in this room are sent with the report.' : ''}
                            </Text>
                            <RNView style={styles.reasons}>
                                {REASONS.map(r => {
                                    const on = reason === r.key;
                                    return (
                                        <Pressable
                                            key={r.key}
                                            onPress={() => setReason(r.key)}
                                            style={({ pressed }) => [styles.reason, on && styles.reasonOn, pressed && { opacity: 0.85 }]}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: on }}
                                        >
                                            <MaterialCommunityIcons name={r.icon} size={18} color={on ? INDIGO : MUTED} />
                                            <Text weight="bold" style={[styles.reasonText, on && { color: INDIGO }]}>{r.label}</Text>
                                            <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={on ? INDIGO : '#C9CBE3'} />
                                        </Pressable>
                                    );
                                })}
                            </RNView>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="Anything else we should know? (optional)"
                                placeholderTextColor="#A3A7C7"
                                maxLength={NOTE_MAX}
                                multiline
                                style={styles.note}
                            />
                            {!isBlocked && (
                                <RNView style={styles.toggleRow}>
                                    <Text weight="semiBold" style={styles.toggleText} numberOfLines={1}>Also block {name}</Text>
                                    <Switch
                                        value={alsoBlock}
                                        onValueChange={setAlsoBlock}
                                        trackColor={{ false: '#DCDDEB', true: '#F3A3AD' }}
                                        thumbColor={alsoBlock ? RED : '#FFFFFF'}
                                    />
                                </RNView>
                            )}
                            {error && <Text weight="semiBold" style={styles.error}>{error}</Text>}
                            <Pressable
                                onPress={() => void sendReport()}
                                disabled={!reason || busy}
                                style={({ pressed }) => [styles.primaryBtn, (!reason || busy) && { opacity: 0.45 }, pressed && styles.pressed]}
                            >
                                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text weight="bold" style={styles.primaryText}>Send report</Text>}
                            </Pressable>
                        </>
                    )}

                    {view === 'reported' && (
                        <RNView style={styles.done}>
                            <RNView style={styles.doneIcon}>
                                <MaterialCommunityIcons name="check" size={30} color="#16A34A" />
                            </RNView>
                            <Text weight="bold" style={styles.doneTitle}>Thanks for reporting</Text>
                            <Text weight="medium" style={styles.doneSub}>
                                We’ll look into it.{blockedByReport ? ` ${name} is blocked: you won’t see their emotes or chat.` : ''}
                            </Text>
                            <Pressable onPress={onClose} style={({ pressed }) => [styles.primaryBtn, styles.doneBtn, pressed && styles.pressed]}>
                                <Text weight="bold" style={styles.primaryText}>Done</Text>
                            </Pressable>
                        </RNView>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function ActionRow({ icon, label, sub, onPress, danger, busy }: {
    icon: IconName;
    label: string;
    sub: string;
    onPress: () => void;
    danger?: boolean;
    busy?: boolean;
}) {
    const color = danger ? RED : INK;
    return (
        <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
            <RNView style={[styles.actionIcon, danger && { backgroundColor: '#FDECEE' }]}>
                <MaterialCommunityIcons name={icon} size={18} color={danger ? RED : MUTED} />
            </RNView>
            <RNView style={{ flex: 1 }}>
                <Text weight="bold" style={[styles.actionLabel, { color }]}>{label}</Text>
                <Text weight="medium" style={styles.actionSub}>{sub}</Text>
            </RNView>
            {busy ? <ActivityIndicator size="small" color={MUTED} /> : <MaterialCommunityIcons name="chevron-right" size={20} color="#C9CBE3" />}
        </Pressable>
    );
}

function Point({ icon, text }: { icon: IconName; text: string }) {
    return (
        <RNView style={styles.point}>
            <MaterialCommunityIcons name={icon} size={18} color={MUTED} />
            <Text weight="medium" style={styles.pointText}>{text}</Text>
        </RNView>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    scrim: { flex: 1, backgroundColor: 'rgba(10, 8, 50, 0.55)' },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDEB', marginTop: 10, marginBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    title: { flex: 1, fontSize: 20, color: INK },
    roundBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },

    profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    name: { fontSize: 20, color: INK },
    blockedChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        marginTop: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: '#FDECEE',
    },
    blockedChipText: { fontSize: 11, color: RED },

    card: { borderRadius: 18, backgroundColor: TRACK, paddingHorizontal: 12 },
    separator: { height: 1, backgroundColor: '#E3E2F5', marginLeft: 48 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 15 },
    actionSub: { fontSize: 12, color: MUTED, marginTop: 1 },

    points: { gap: 12, padding: 14, borderRadius: 18, backgroundColor: TRACK, marginBottom: 14 },
    point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    pointText: { flex: 1, fontSize: 14, lineHeight: 19, color: INK },

    hint: { fontSize: 13, color: MUTED, marginBottom: 10 },
    reasons: { gap: 8 },
    reason: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 48,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: TRACK,
        borderWidth: 1.5,
        borderColor: TRACK,
    },
    reasonOn: { backgroundColor: '#ECEBFF', borderColor: INDIGO },
    reasonText: { flex: 1, fontSize: 14, color: INK },
    note: {
        minHeight: 70,
        maxHeight: 120,
        marginTop: 10,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        borderRadius: 14,
        backgroundColor: TRACK,
        fontSize: 14,
        color: INK,
        fontFamily: Fonts.semiBold,
        textAlignVertical: 'top',
    },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingHorizontal: 4 },
    toggleText: { flex: 1, fontSize: 14, color: INK },

    primaryBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: INDIGO, marginTop: 14 },
    primaryText: { fontSize: 16, color: '#FFFFFF' },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    error: { fontSize: 12, color: RED, marginTop: 10, marginLeft: 4 },

    done: { alignItems: 'center', paddingTop: 8 },
    doneIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#E7F7EC', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    doneTitle: { fontSize: 20, color: INK },
    doneSub: { fontSize: 14, lineHeight: 20, color: MUTED, textAlign: 'center', marginTop: 6, paddingHorizontal: 8 },
    doneBtn: { alignSelf: 'stretch' },
});
