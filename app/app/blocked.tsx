import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BlockedUser } from '@/apis/social-api';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { loadBlocks, unblockPlayer, useBlockedUsers } from '@/hooks/useBlocks';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const RED = '#E2364A';
const TRACK = '#F1F0FA';

function since(iso: string): string {
    return `Blocked ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Players you've blocked, from Profile: unblock them here. */
export default function BlockedPlayers() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const blocked = useBlockedUsers();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void loadBlocks().finally(() => setLoading(false));
    }, []);

    const close = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/profile');
    };

    const unblock = async (id: string) => {
        setBusy(b => ({ ...b, [id]: true }));
        setError(null);
        const res = await unblockPlayer(id);
        setBusy(b => ({ ...b, [id]: false }));
        if (!res.ok) setError(res.error ?? 'Could not unblock. Try again.');
    };

    const renderRow = ({ item }: { item: BlockedUser }) => (
        <RNView style={styles.row}>
            <UserAvatar user={item.user} size={44} />
            <RNView style={{ flex: 1 }}>
                <Text weight="bold" style={styles.username} numberOfLines={1}>@{item.user.username}</Text>
                <Text weight="medium" style={styles.rowSub} numberOfLines={1}>{since(item.createdAt)}</Text>
            </RNView>
            <Pressable
                onPress={() => void unblock(item.user.id)}
                disabled={busy[item.user.id]}
                style={({ pressed }) => [styles.pill, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
                hitSlop={6}
            >
                {busy[item.user.id] ? <ActivityIndicator size="small" color={INDIGO} /> : <Text weight="bold" style={styles.pillText}>Unblock</Text>}
            </Pressable>
        </RNView>
    );

    return (
        <RNView style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
            <Animated.View entering={SlideInDown.duration(320)} style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                <RNView style={styles.grabber} />
                <RNView style={styles.titleRow}>
                    <Text weight="bold" style={styles.title}>Blocked players</Text>
                    <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
                        <MaterialCommunityIcons name="close" size={20} color={MUTED} />
                    </Pressable>
                </RNView>
                <Text weight="medium" style={styles.hint}>
                    You don’t see each other’s emotes or chat, and they can’t add or invite you. They aren’t told.
                </Text>
                {error && <Text weight="semiBold" style={styles.error}>{error}</Text>}
                <FlatList
                    data={blocked}
                    keyExtractor={b => b.user.id}
                    renderItem={renderRow}
                    ListEmptyComponent={
                        loading ? (
                            <ActivityIndicator color={INDIGO} style={{ marginTop: 32 }} />
                        ) : (
                            <Animated.View entering={FadeIn} style={styles.empty}>
                                <RNView style={styles.emptyIcon}>
                                    <MaterialCommunityIcons name="account-cancel-outline" size={30} color={INDIGO} />
                                </RNView>
                                <Text weight="bold" style={styles.emptyTitle}>Nobody blocked</Text>
                                <Text weight="medium" style={styles.emptySub}>Tap a player’s seat in a game to block or report them.</Text>
                            </Animated.View>
                        )
                    }
                    contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
                    style={{ flex: 1 }}
                />
            </Animated.View>
        </RNView>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 8, 50, 0.55)' },
    sheet: {
        height: '70%',
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDEB', marginTop: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
    title: { fontSize: 22, color: INK },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center' },
    hint: { fontSize: 13, lineHeight: 18, color: MUTED, marginBottom: 8 },
    error: { fontSize: 12, color: RED, marginBottom: 4 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    username: { fontSize: 15, color: INK },
    rowSub: { fontSize: 12, color: MUTED, marginTop: 2 },
    pill: { height: 36, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: TRACK },
    pillText: { fontSize: 13, color: INDIGO },

    empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, gap: 6 },
    emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: TRACK, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    emptyTitle: { fontSize: 16, color: INK },
    emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },
});
