import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    acceptFriend,
    getNotifications,
    markNotificationsRead,
    removeFriend,
    type AppNotification,
} from '@/apis/social-api';
import { AccountRequired } from '@/components/AccountRequired';
import { useSocial } from '@/components/SocialProvider';
import { useIsGuest } from '@/hooks/useIsGuest';
import { usePagedList } from '@/hooks/usePagedList';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import Colors from '@/constants/Colors';
import { friendsHref, type FriendsTab } from '@/util/links';

const palette = Colors.dark;

const noteKey = (n: AppNotification) => n.id;

function timeAgo(iso: string): string {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Invites are only joinable while their room is still waiting for players. */
const inviteLive = (n: AppNotification) => n.type === 'ROOM_INVITE' && !!n.gameCode && !!n.roomOpen;

function describe(n: AppNotification): { text: string; tab: FriendsTab } {
    if (n.type === 'ROOM_INVITE') {
        return { text: inviteLive(n) ? `invited you to play in room ${n.gameCode}.` : `invited you to room ${n.gameCode} — that game has closed.`, tab: 'friends' };
    }
    if (n.type === 'FRIEND_ACCEPTED') return { text: 'accepted your friend request.', tab: 'friends' };
    if (n.relation === 'friends') return { text: 'is now your friend.', tab: 'friends' };
    return { text: 'sent you a friend request.', tab: 'requests' };
}

export default function NotificationsScreen() {
    const guest = useIsGuest();
    const insets = useSafeAreaInsets();
    if (!guest) return <NotificationsList />;
    // Guests have no friends or invites, so there is nothing to load.
    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 12 }]}>
            <RNView style={styles.header}>
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Notifications</Text>
                    <Text weight="medium" style={styles.subtitle}>Friend requests and updates</Text>
                </RNView>
            </RNView>
            <AccountRequired
                icon="bell-ring-outline"
                title="Alerts come with an account"
                sub="Save your progress with Google or an email, and friend requests and room invites will show up here."
            />
        </RNView>
    );
}

function NotificationsList() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { revision, refresh, summary } = useSocial();

    const { items, error, loadingMore, reload, loadMore } = usePagedList<AppNotification>(getNotifications, noteKey);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    /** Unread when this visit started — stays highlighted until the player leaves the tab. */
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    const focused = useRef(false);

    const load = useCallback(async () => {
        await reload();
    }, [reload]);

    // Remember what was unread while the tab is open, so marking read doesn't un-highlight it.
    useEffect(() => {
        if (!focused.current || !items) return;
        const unread = items.filter(n => !n.readAt).map(n => n.id);
        if (unread.length) setFresh(prev => (unread.every(id => prev.has(id)) ? prev : new Set([...prev, ...unread])));
    }, [items]);

    useEffect(() => {
        void load();
    }, [load, revision]);

    // Seeing the tab marks everything read; the highlight clears on the way out.
    useFocusEffect(
        useCallback(() => {
            focused.current = true;
            void load();
            return () => {
                focused.current = false;
                setFresh(new Set());
            };
        }, [load]),
    );
    useEffect(() => {
        if (!focused.current || summary.unreadNotifications === 0) return;
        const t = setTimeout(() => {
            void markNotificationsRead().then(refresh);
        }, 800);
        return () => clearTimeout(t);
    }, [summary.unreadNotifications, fresh, refresh]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    /** The friends modal opens over Home, on the right tab. */
    const openFriends = (tab: FriendsTab) => {
        router.navigate('/(tabs)');
        router.push(friendsHref(tab));
    };

    const respond = async (n: AppNotification, accept: boolean) => {
        setBusy(b => ({ ...b, [n.id]: true }));
        await (accept ? acceptFriend : removeFriend)(n.actor.id);
        setBusy(b => ({ ...b, [n.id]: false }));
        refresh();
    };

    const renderItem = ({ item, index }: { item: AppNotification; index: number }) => {
        const { text, tab } = describe(item);
        const pending = item.type === 'FRIEND_REQUEST' && item.relation === 'incoming';
        const invite = inviteLive(item);
        const joinInvite = () => router.push({ pathname: '/join/[code]', params: { code: item.gameCode! } });
        const unread = fresh.has(item.id) || !item.readAt;
        return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
                <Pressable
                    onPress={() => (invite ? joinInvite() : openFriends(tab))}
                    style={({ pressed }) => [styles.card, unread && styles.cardUnread, pressed && { opacity: 0.85 }]}
                >
                    <UserAvatar user={item.actor} size={46} />
                    <RNView style={{ flex: 1, gap: 4 }}>
                        <Text weight="medium" style={styles.body}>
                            <Text weight="bold" style={styles.actor}>@{item.actor.username}</Text> {text}
                        </Text>
                        <Text weight="medium" style={styles.when}>{timeAgo(item.createdAt)}</Text>
                        {invite && (
                            <RNView style={styles.actions}>
                                <Pressable
                                    onPress={joinInvite}
                                    style={({ pressed }) => [styles.btn, styles.btnAccept, pressed && styles.btnPressed]}
                                >
                                    <Text weight="bold" style={styles.btnAcceptText}>Join game</Text>
                                </Pressable>
                            </RNView>
                        )}
                        {pending && (
                            <RNView style={styles.actions}>
                                <Pressable
                                    onPress={() => void respond(item, true)}
                                    disabled={busy[item.id]}
                                    style={({ pressed }) => [styles.btn, styles.btnAccept, pressed && styles.btnPressed]}
                                >
                                    {busy[item.id]
                                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                                        : <Text weight="bold" style={styles.btnAcceptText}>Accept</Text>}
                                </Pressable>
                                <Pressable
                                    onPress={() => void respond(item, false)}
                                    disabled={busy[item.id]}
                                    style={({ pressed }) => [styles.btn, styles.btnDecline, pressed && styles.btnPressed]}
                                >
                                    <Text weight="bold" style={styles.btnDeclineText}>Decline</Text>
                                </Pressable>
                            </RNView>
                        )}
                    </RNView>
                    {unread && <RNView style={styles.unreadDot} />}
                </Pressable>
            </Animated.View>
        );
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 12 }]}>
            <RNView style={styles.header}>
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Notifications</Text>
                    <Text weight="medium" style={styles.subtitle}>Friend requests and updates</Text>
                </RNView>
                <Pressable onPress={() => router.push(friendsHref('friends'))} style={styles.friendsBtn} hitSlop={6}>
                    <MaterialCommunityIcons name="account-multiple" size={18} color="#FFFFFF" />
                    <Text weight="bold" style={styles.friendsBtnText}>Friends</Text>
                </Pressable>
            </RNView>

            <FlatList
                data={items ?? []}
                keyExtractor={n => n.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10, flexGrow: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
                onEndReached={() => void loadMore()}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMore ? <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 16 }} /> : null}
                ListEmptyComponent={
                    items === null && !error ? (
                        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 48 }} />
                    ) : (
                        <RNView style={styles.empty}>
                            <RNView style={styles.emptyIcon}>
                                <MaterialCommunityIcons name={error ? 'wifi-off' : 'bell-sleep-outline'} size={32} color="#FFFFFF" />
                            </RNView>
                            <Text weight="bold" style={styles.emptyTitle}>{error ? "Couldn't load notifications" : 'All caught up'}</Text>
                            <Text weight="medium" style={styles.emptySub}>
                                {error ?? 'Friend requests and other updates will show up here.'}
                            </Text>
                        </RNView>
                    )
                }
            />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
    title: { fontSize: 26, color: palette.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: palette.mutedText },
    friendsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    friendsBtnText: { fontSize: 13, color: '#FFFFFF' },

    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 8, 60, 0.24)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    cardUnread: { backgroundColor: 'rgba(255, 255, 255, 0.16)', borderColor: 'rgba(255,255,255,0.28)' },
    body: { fontSize: 14, lineHeight: 19, color: 'rgba(255,255,255,0.9)' },
    actor: { color: '#FFFFFF' },
    when: { fontSize: 12, color: palette.mutedText },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFD54A', marginTop: 6 },

    actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    btn: { height: 36, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    btnPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
    btnAccept: { backgroundColor: '#22C55E', minWidth: 92 },
    btnAcceptText: { fontSize: 13, color: '#FFFFFF' },
    btnDecline: { backgroundColor: 'rgba(255,255,255,0.14)' },
    btnDeclineText: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

    empty: { alignItems: 'center', padding: 32, gap: 8, marginTop: 40 },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, color: palette.text },
    emptySub: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
});
