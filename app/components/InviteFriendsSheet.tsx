import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFriends, inviteFriend, type Friend } from '@/apis/social-api';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { usePagedList } from '@/hooks/usePagedList';
import { friendsHref } from '@/util/links';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const GREEN = '#16A34A';
const TRACK = '#F1F0FA';

const friendKey = (f: Friend) => f.user.id;

type InviteState = 'sending' | 'sent' | { error: string };

/** Host's friend picker: invite friends into this room, or share the link with anyone. */
export function InviteFriendsSheet({
    visible,
    onClose,
    gameCode,
    memberIds,
    onShareLink,
}: {
    visible: boolean;
    onClose: () => void;
    gameCode: string;
    /** Already in the room — shown as such instead of an Invite button. */
    memberIds: string[];
    onShareLink: () => void;
}) {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { items, error, loadingMore, reload, loadMore } = usePagedList<Friend>(getFriends, friendKey);
    const [sent, setSent] = useState<Record<string, InviteState>>({});

    useEffect(() => {
        if (visible) void reload();
    }, [visible, reload]);

    const invite = async (userId: string) => {
        setSent(s => ({ ...s, [userId]: 'sending' }));
        const res = await inviteFriend(gameCode, userId);
        setSent(s => ({ ...s, [userId]: res.ok ? 'sent' : { error: res.error } }));
    };

    const renderFriend = ({ item }: { item: Friend }) => {
        const state = sent[item.user.id];
        const inRoom = memberIds.includes(item.user.id);
        const failed = typeof state === 'object' ? state.error : null;
        return (
            <RNView style={styles.row}>
                <UserAvatar user={item.user} size={44} online={item.online} />
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.username} numberOfLines={1}>@{item.user.username}</Text>
                    <Text weight="medium" style={[styles.sub, item.online && { color: GREEN }, failed && { color: '#E2364A' }]} numberOfLines={1}>
                        {failed ?? (item.online ? 'Online now' : 'Offline · gets a notification')}
                    </Text>
                </RNView>
                {inRoom ? (
                    <RNView style={[styles.pill, styles.pillDone]}>
                        <Text weight="bold" style={[styles.pillText, { color: GREEN }]}>In room</Text>
                    </RNView>
                ) : state === 'sent' ? (
                    <Pressable onPress={() => void invite(item.user.id)} style={[styles.pill, styles.pillDone]} hitSlop={6}>
                        <MaterialCommunityIcons name="check" size={16} color={GREEN} />
                        <Text weight="bold" style={[styles.pillText, { color: GREEN }]}>Invited</Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() => void invite(item.user.id)}
                        disabled={state === 'sending'}
                        style={({ pressed }) => [styles.pill, styles.pillPrimary, pressed && { opacity: 0.8 }]}
                        hitSlop={6}
                    >
                        {state === 'sending' ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <MaterialCommunityIcons name="send" size={14} color="#FFFFFF" />
                                <Text weight="bold" style={[styles.pillText, { color: '#FFFFFF' }]}>Invite</Text>
                            </>
                        )}
                    </Pressable>
                )}
            </RNView>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <RNView style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
                    <Animated.View entering={FadeIn.duration(180)} style={styles.scrim} />
                </Pressable>
                <Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
                    <RNView style={styles.grabber} />
                    <RNView style={styles.titleRow}>
                        <RNView style={{ flex: 1 }}>
                            <Text weight="bold" style={styles.title}>Invite friends</Text>
                            <Text weight="medium" style={styles.subtitle}>They’ll get a notification to join room {gameCode}</Text>
                        </RNView>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
                            <MaterialCommunityIcons name="close" size={20} color={MUTED} />
                        </Pressable>
                    </RNView>

                    <Pressable onPress={onShareLink} style={({ pressed }) => [styles.shareRow, pressed && { opacity: 0.8 }]}>
                        <RNView style={styles.shareIcon}>
                            <MaterialCommunityIcons name="link-variant" size={20} color={INDIGO} />
                        </RNView>
                        <RNView style={{ flex: 1 }}>
                            <Text weight="bold" style={styles.username}>Share invite link</Text>
                            <Text weight="medium" style={styles.sub}>WhatsApp, Messages — anyone with the link can join</Text>
                        </RNView>
                        <MaterialCommunityIcons name="chevron-right" size={22} color={MUTED} />
                    </Pressable>

                    <Text weight="bold" style={styles.section}>Friends</Text>
                    <FlatList
                        data={items ?? []}
                        keyExtractor={friendKey}
                        renderItem={renderFriend}
                        onEndReached={() => void loadMore()}
                        onEndReachedThreshold={0.5}
                        style={{ flexGrow: 0 }}
                        contentContainerStyle={{ paddingBottom: 8 }}
                        ListFooterComponent={loadingMore ? <ActivityIndicator color={INDIGO} style={{ marginVertical: 12 }} /> : null}
                        ListEmptyComponent={
                            items === null && !error ? (
                                <ActivityIndicator color={INDIGO} style={{ marginVertical: 32 }} />
                            ) : (
                                <RNView style={styles.empty}>
                                    <Text weight="bold" style={styles.emptyTitle}>{error ? "Couldn't load friends" : 'No friends yet'}</Text>
                                    <Text weight="medium" style={styles.sub}>{error ?? 'Add friends to invite them in one tap.'}</Text>
                                    {!error && (
                                        <Pressable
                                            onPress={() => {
                                                onClose();
                                                router.push(friendsHref('friends'));
                                            }}
                                            style={[styles.pill, styles.pillPrimary, { marginTop: 10, paddingHorizontal: 16 }]}
                                        >
                                            <MaterialCommunityIcons name="account-plus" size={16} color="#FFFFFF" />
                                            <Text weight="bold" style={[styles.pillText, { color: '#FFFFFF' }]}>Find friends</Text>
                                        </Pressable>
                                    )}
                                </RNView>
                            )
                        }
                    />
                </Animated.View>
            </RNView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    scrim: { flex: 1, backgroundColor: 'rgba(10, 8, 50, 0.55)' },
    sheet: {
        maxHeight: '80%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDEB', marginTop: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12, marginBottom: 14 },
    title: { fontSize: 22, color: INK },
    subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },

    shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: TRACK },
    shareIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

    section: { fontSize: 12, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
    username: { fontSize: 15, color: INK },
    sub: { fontSize: 12, color: MUTED, marginTop: 2 },
    pill: { height: 36, minWidth: 92, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    pillPrimary: { backgroundColor: INDIGO },
    pillDone: { backgroundColor: '#E7F7EC' },
    pillText: { fontSize: 13 },
    empty: { alignItems: 'center', paddingVertical: 28, gap: 2 },
    emptyTitle: { fontSize: 16, color: INK },
});
