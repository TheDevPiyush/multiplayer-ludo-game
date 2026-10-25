import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
    View as RNView,
} from 'react-native';
import { Portal } from 'react-native-paper';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    acceptFriend,
    addFriend,
    getFriendRequests,
    getFriends,
    removeFriend,
    searchUsers,
    type Friend,
    type FriendRequest,
    type PublicUser,
    type Relation,
    type SearchResult,
} from '@/apis/social-api';
import AppDialog from '@/components/Dialog';
import { useSocial } from '@/components/SocialProvider';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { Fonts } from '@/constants/fonts';
import { usePagedList } from '@/hooks/usePagedList';
import type { FriendsTab } from '@/util/links';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const GREEN = '#16A34A';
const TRACK = '#F1F0FA';

type Row =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'person'; key: string; user: PublicUser; relation: Relation; online?: boolean };

const friendKey = (f: Friend) => f.user.id;
const requestKey = (r: FriendRequest) => `${r.direction}-${r.user.id}`;

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Pill({
    label,
    icon,
    tone,
    onPress,
    busy,
}: {
    label?: string;
    icon?: IconName;
    tone: 'primary' | 'success' | 'muted' | 'done';
    onPress?: () => void;
    busy?: boolean;
}) {
    const t = PILL_TONES[tone];
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress || busy}
            style={({ pressed }) => [
                styles.pill,
                { backgroundColor: t.bg, paddingHorizontal: label ? 14 : 0, width: label ? undefined : 36 },
                pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
            ]}
            hitSlop={6}
        >
            {busy ? (
                <ActivityIndicator size="small" color={t.fg} />
            ) : (
                <>
                    {icon && <MaterialCommunityIcons name={icon} size={16} color={t.fg} />}
                    {label && <Text weight="bold" style={[styles.pillText, { color: t.fg }]}>{label}</Text>}
                </>
            )}
        </Pressable>
    );
}

const PILL_TONES = {
    primary: { bg: INDIGO, fg: '#FFFFFF' },
    success: { bg: GREEN, fg: '#FFFFFF' },
    muted: { bg: TRACK, fg: MUTED },
    done: { bg: '#E7F7EC', fg: GREEN },
} as const;

function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
    return (
        <Animated.View entering={FadeIn} style={styles.empty}>
            <RNView style={styles.emptyIcon}>
                <MaterialCommunityIcons name={icon} size={30} color={INDIGO} />
            </RNView>
            <Text weight="bold" style={styles.emptyTitle}>{title}</Text>
            <Text weight="medium" style={styles.emptySub}>{sub}</Text>
        </Animated.View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

/**
 * Friends modal. A route, so it opens from anywhere — including links:
 * /friends?tab=friends | /friends?tab=requests.
 */
export default function FriendsModal() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ tab?: string }>();
    const tab: FriendsTab = params.tab === 'requests' ? 'requests' : 'friends';
    const { revision, refresh, summary } = useSocial();

    const friendList = usePagedList<Friend>(getFriends, friendKey);
    const requestList = usePagedList<FriendRequest>(getFriendRequests, requestKey);
    const friends = friendList.items;
    const requests = requestList.items;
    const loadError = tab === 'friends' ? friendList.error : requestList.error;

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [searching, setSearching] = useState(false);
    const searchSeq = useRef(0);

    const [busy, setBusy] = useState<Record<string, boolean>>({});
    const [dialog, setDialog] = useState<{ title: string; message: string; confirm?: { label: string; run: () => void } } | null>(null);

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
    }, [router]);

    const setTab = (next: FriendsTab) => router.setParams({ tab: next });

    // ─── Data ──────────────────────────────────────────────────────────────
    // First page of each list; anything changing server-side starts them over.
    const { reload: reloadFriends } = friendList;
    const { reload: reloadRequests } = requestList;
    useEffect(() => {
        void reloadFriends();
        void reloadRequests();
    }, [reloadFriends, reloadRequests, revision]);

    const searchTerm = query.trim().replace(/^@/, '');
    const isSearching = searchTerm.length > 0;

    useEffect(() => {
        const id = ++searchSeq.current;
        if (searchTerm.length < 2) {
            setResults(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timer = setTimeout(async () => {
            const res = await searchUsers(searchTerm);
            if (id !== searchSeq.current) return;
            setSearching(false);
            setResults(res.ok ? res.data.data : []);
        }, 250);
        return () => clearTimeout(timer);
    }, [searchTerm, revision]);

    // ─── Actions ───────────────────────────────────────────────────────────
    const run = useCallback(
        async (user: PublicUser, call: (id: string) => ReturnType<typeof addFriend>) => {
            setBusy(b => ({ ...b, [user.id]: true }));
            const res = await call(user.id);
            setBusy(b => ({ ...b, [user.id]: false }));
            if (!res.ok) {
                setDialog({ title: 'Something went wrong', message: res.error });
                return;
            }
            const relation = res.data.relation;
            setResults(rs => rs?.map(r => (r.user.id === user.id ? { ...r, relation } : r)) ?? rs);
            refresh();
        },
        [refresh],
    );

    const confirmRemove = (user: PublicUser, relation: Relation) => {
        const copy =
            relation === 'friends'
                ? { title: 'Remove friend?', message: `@${user.username} will be removed from your friends.`, label: 'Remove' }
                : { title: 'Cancel request?', message: `Your friend request to @${user.username} will be withdrawn.`, label: 'Cancel request' };
        setDialog({ title: copy.title, message: copy.message, confirm: { label: copy.label, run: () => void run(user, removeFriend) } });
    };

    // ─── Rows ──────────────────────────────────────────────────────────────
    const rows: Row[] = useMemo(() => {
        if (isSearching) {
            return (results ?? []).map(r => ({ kind: 'person', key: `s-${r.user.id}`, user: r.user, relation: r.relation }));
        }
        if (tab === 'friends') {
            return (friends ?? []).map(f => ({ kind: 'person', key: `f-${f.user.id}`, user: f.user, relation: 'friends', online: f.online }));
        }
        // Paged list: received first, then sent — a header where each group starts.
        const out: Row[] = [];
        let direction: FriendRequest['direction'] | null = null;
        for (const r of requests ?? []) {
            if (r.direction !== direction) {
                direction = r.direction;
                out.push(
                    direction === 'incoming'
                        ? { kind: 'header', key: 'h-in', title: `Received · ${summary.incomingRequests}` }
                        : { kind: 'header', key: 'h-out', title: `Sent · ${summary.outgoingRequests}` },
                );
            }
            out.push({ kind: 'person', key: `${r.direction}-${r.user.id}`, user: r.user, relation: r.direction });
        }
        return out;
    }, [isSearching, results, tab, friends, requests, summary.incomingRequests, summary.outgoingRequests]);

    const subtitleFor = (row: Extract<Row, { kind: 'person' }>) => {
        if (row.online !== undefined && row.online) return 'Online now';
        const { totalWins: w, totalGames: g } = row.user;
        return g > 0 ? `${w} ${w === 1 ? 'win' : 'wins'} · ${g} ${g === 1 ? 'game' : 'games'}` : 'New player';
    };

    const actionsFor = (row: Extract<Row, { kind: 'person' }>) => {
        const { user, relation } = row;
        const isBusy = !!busy[user.id];
        switch (relation) {
            case 'none':
                return <Pill label="Add" icon="account-plus" tone="primary" busy={isBusy} onPress={() => void run(user, addFriend)} />;
            case 'incoming':
                return (
                    <RNView style={styles.actions}>
                        <Pill icon="close" tone="muted" busy={isBusy} onPress={() => void run(user, removeFriend)} />
                        <Pill label="Accept" tone="success" busy={isBusy} onPress={() => void run(user, acceptFriend)} />
                    </RNView>
                );
            case 'outgoing':
                return <Pill label="Requested" icon="clock-outline" tone="muted" busy={isBusy} onPress={() => confirmRemove(user, relation)} />;
            case 'friends':
                return isSearching
                    ? <Pill label="Friends" icon="check" tone="done" />
                    : <Pill icon="dots-horizontal" tone="muted" busy={isBusy} onPress={() => confirmRemove(user, relation)} />;
        }
    };

    const renderRow = ({ item }: { item: Row }) => {
        if (item.kind === 'header') return <Text weight="bold" style={styles.sectionHeader}>{item.title}</Text>;
        return (
            <RNView style={styles.row}>
                <UserAvatar user={item.user} size={44} online={item.online} />
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.username} numberOfLines={1}>@{item.user.username}</Text>
                    <Text weight="medium" style={[styles.rowSub, item.online && { color: GREEN }]} numberOfLines={1}>
                        {subtitleFor(item)}
                    </Text>
                </RNView>
                {actionsFor(item)}
            </RNView>
        );
    };

    const listEmpty = () => {
        if (isSearching) {
            if (searchTerm.length < 2) return <EmptyState icon="magnify" title="Keep typing" sub="Enter at least 2 letters of a username." />;
            if (searching || results === null) return <ActivityIndicator color={INDIGO} style={{ marginTop: 32 }} />;
            return <EmptyState icon="account-search-outline" title="No players found" sub={`Nobody's username starts with "${searchTerm}".`} />;
        }
        if ((tab === 'friends' ? friends : requests) === null) {
            return loadError
                ? <EmptyState icon="wifi-off" title="Couldn't load" sub={loadError} />
                : <ActivityIndicator color={INDIGO} style={{ marginTop: 32 }} />;
        }
        return tab === 'friends'
            ? <EmptyState icon="account-group-outline" title="No friends yet" sub="Search for a username above and send a friend request." />
            : <EmptyState icon="email-outline" title="No pending requests" sub="Requests you send or receive show up here." />;
    };

    const requestCount = summary.incomingRequests;
    const activeList = tab === 'friends' ? friendList : requestList;

    return (
        // Own portal host: dialogs must stack above this modal screen, not the app root behind it.
        <Portal.Host>
            <RNView style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close friends" />
                <Animated.View entering={SlideInDown.duration(320)} style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                    <RNView style={styles.grabber} />

                    <RNView style={styles.titleRow}>
                        <Text weight="bold" style={styles.title}>Friends</Text>
                        <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
                            <MaterialCommunityIcons name="close" size={20} color={MUTED} />
                        </Pressable>
                    </RNView>

                    <RNView style={styles.search}>
                        <MaterialCommunityIcons name="magnify" size={20} color={MUTED} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search by username"
                            placeholderTextColor="#A3A7C7"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                            style={styles.searchInput}
                        />
                        {searching && <ActivityIndicator size="small" color={INDIGO} />}
                        {query.length > 0 && !searching && (
                            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                                <MaterialCommunityIcons name="close-circle" size={18} color="#B8BCD6" />
                            </Pressable>
                        )}
                    </RNView>

                    {!isSearching && (
                        <RNView style={styles.tabs}>
                            {([
                                { key: 'friends', label: 'My Friends', count: summary.friends, badge: false },
                                { key: 'requests', label: 'Requests', count: requestCount, badge: requestCount > 0 },
                            ] as const).map(t => {
                                const active = tab === t.key;
                                return (
                                    <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, active && styles.tabActive]}>
                                        <Text weight="bold" style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                                        {t.count > 0 && (
                                            <RNView style={[styles.count, t.badge && styles.countBadge]}>
                                                <Text weight="bold" style={[styles.countText, t.badge && { color: '#FFFFFF' }]}>{t.count}</Text>
                                            </RNView>
                                        )}
                                    </Pressable>
                                );
                            })}
                        </RNView>
                    )}

                    <FlatList
                        data={rows}
                        keyExtractor={r => r.key}
                        renderItem={renderRow}
                        ListEmptyComponent={listEmpty}
                        onEndReached={isSearching ? undefined : () => void activeList.loadMore()}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={
                            !isSearching && activeList.loadingMore
                                ? <ActivityIndicator color={INDIGO} style={{ marginVertical: 16 }} />
                                : null
                        }
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
                        style={{ flex: 1 }}
                    />
                </Animated.View>

                <AppDialog
                    visible={!!dialog}
                    title={dialog?.title ?? ''}
                    message={dialog?.message}
                    onDismiss={() => setDialog(null)}
                    actions={
                        dialog?.confirm
                            ? [
                                { label: 'Keep', onPress: () => setDialog(null) },
                                { label: dialog.confirm.label, onPress: () => { dialog.confirm!.run(); setDialog(null); } },
                            ]
                            : undefined
                    }
                />
            </RNView>
        </Portal.Host>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 8, 50, 0.55)' },
    sheet: {
        height: '88%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDEB', marginTop: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 14 },
    title: { fontSize: 22, color: INK },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },

    search: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 48,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: TRACK,
    },
    searchInput: { flex: 1, fontSize: 15, color: INK, fontFamily: Fonts.semiBold, paddingVertical: 0 },

    tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: TRACK, marginTop: 14 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 11 },
    tabActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#1B1A4A',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    tabText: { fontSize: 14, color: MUTED },
    tabTextActive: { color: INK },
    count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: '#E3E2F5', alignItems: 'center', justifyContent: 'center' },
    countBadge: { backgroundColor: '#E2364A' },
    countText: { fontSize: 11, color: MUTED },

    sectionHeader: { fontSize: 12, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    username: { fontSize: 15, color: INK },
    rowSub: { fontSize: 12, color: MUTED, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 8 },
    pill: { height: 36, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    pillText: { fontSize: 13 },

    empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, gap: 6 },
    emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    emptyTitle: { fontSize: 16, color: INK },
    emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },
});
