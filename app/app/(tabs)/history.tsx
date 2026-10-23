import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import type { GameHistoryEntry } from '@/apis/user-api';
import { fetchGameHistory } from '@/apis/user-api';
import Colors from '@/constants/Colors';
import { LUDO } from '@/constants/LudoColors';
import { usePagedList } from '@/hooks/usePagedList';
import { historyFetchedAt, markHistoryFetched } from '@/util/history-cache';
import { supabase } from '@/util/supabase-client';

const palette = Colors.dark;

const COLOR_HEX: Record<string, string> = {
    RED: LUDO.red,
    BLUE: LUDO.blue,
    GREEN: LUDO.green,
    YELLOW: LUDO.yellow,
};

function formatDay(iso: string) {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days < 1 && new Date().getDate() === d.getDate()) return 'Today';
    if (days < 2) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function duration(start: string | null, end: string | null) {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return null;
    const mins = Math.round(ms / 60000);
    if (mins < 1) return '<1 min';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

function outcome(item: GameHistoryEntry): { label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; tone: string } {
    if (item.status === 'CANCELLED') return { label: 'Cancelled', icon: 'close', tone: 'rgba(255,255,255,0.45)' };
    if (item.isWin) return { label: 'Won', icon: 'crown', tone: '#FFD54A' };
    if (item.myRank && item.myRank < item.playerCount) return { label: `${ORDINAL[item.myRank] ?? `#${item.myRank}`} place`, icon: 'medal', tone: '#C9D1FF' };
    return { label: 'Lost', icon: 'flag-variant', tone: 'rgba(255,255,255,0.6)' };
}

/** "vs @alex", "vs @alex, @sam", "vs @alex +2" */
function opponents(item: GameHistoryEntry): string | null {
    const others = item.players.filter(p => p.color !== item.myColor).map(p => `@${p.username}`);
    if (others.length === 0) return null;
    return `vs ${others.length <= 2 ? others.join(', ') : `${others[0]} +${others.length - 1}`}`;
}

function HistoryRow({ item }: { item: GameHistoryEntry }) {
    const result = outcome(item);
    const myColor = COLOR_HEX[item.myColor] ?? palette.mutedText;
    const when = item.endedAt ?? item.startedAt ?? item.createdAt;
    const meta = [opponents(item), duration(item.startedAt, item.endedAt)].filter(Boolean).join(' · ');

    return (
        <RNView style={styles.row}>
            <RNView style={[styles.badge, { backgroundColor: myColor }]}>
                <MaterialCommunityIcons name={result.icon} size={18} color="#FFFFFF" />
            </RNView>
            <RNView style={styles.rowMain}>
                <Text weight="bold" style={[styles.result, { color: result.tone }]} numberOfLines={1}>{result.label}</Text>
                <Text weight="medium" style={styles.meta} numberOfLines={1}>{meta || `${item.playerCount} players`}</Text>
            </RNView>
            <RNView style={styles.rowEnd}>
                <Text weight="semiBold" style={styles.day}>{formatDay(when)}</Text>
                <Text weight="medium" style={styles.code}>{item.gameCode} · {formatTime(when)}</Text>
            </RNView>
        </RNView>
    );
}

const HISTORY_KEY = 'simpleludo:history';
/** Re-fetch on tab focus at most this often; pull-to-refresh always fetches. */
const HISTORY_STALE_MS = 60_000;

const historyKey = (g: GameHistoryEntry) => `${g.gameCode}-${g.createdAt}`;

async function fetchHistoryPage(cursor?: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false as const, error: 'Not signed in' };
    return fetchGameHistory(token, cursor);
}

export default function HistoryTabScreen() {
    const insets = useSafeAreaInsets();
    const list = usePagedList<GameHistoryEntry>(fetchHistoryPage, historyKey);
    const items = list.items ?? [];
    const { setItems, reload } = list;
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Show the last known first page instantly, then revalidate.
    useEffect(() => {
        AsyncStorage.getItem(HISTORY_KEY)
            .then(raw => {
                if (!raw) return;
                setItems(prev => (prev?.length ? prev : (JSON.parse(raw) as GameHistoryEntry[])));
                setLoading(false);
            })
            .catch(() => {});
    }, [setItems]);

    const load = useCallback(async (isRefresh = false) => {
        if (!isRefresh && Date.now() - historyFetchedAt() < HISTORY_STALE_MS) {
            setLoading(false);
            return;
        }
        if (isRefresh) setRefreshing(true);
        try {
            if (await reload()) markHistoryFetched();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [reload]);

    // Cache the first page for the next cold start.
    useEffect(() => {
        if (list.items?.length) void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list.items.slice(0, 20))).catch(() => {});
    }, [list.items]);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 12 }]}>
            <RNView style={styles.header}>
                <Text weight="bold" style={styles.title}>Match History</Text>
                <Text weight="medium" style={styles.subtitle}>Your previous games & results</Text>
            </RNView>

            {loading && items.length === 0 ? (
                <RNView style={styles.center}>
                    <ActivityIndicator color={palette.text} />
                </RNView>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={historyKey}
                    onEndReached={() => void list.loadMore()}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={list.loadingMore ? <ActivityIndicator color={palette.text} style={{ marginVertical: 16 }} /> : null}
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingBottom: insets.bottom + 24,
                        gap: 8,
                    }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />
                    }
                    ListEmptyComponent={
                        <GlassPanel intensity="medium" style={styles.empty}>
                            <FontAwesome name="history" size={28} color={palette.dimText} />
                            <Text weight="semiBold" style={styles.emptyTitle}>No games yet</Text>
                            <Text weight="medium" style={styles.emptySub}>
                                {list.error ?? 'Finished matches will appear here.'}
                            </Text>
                        </GlassPanel>
                    }
                    renderItem={({ item }) => <HistoryRow item={item} />}
                />
            )}
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 4,
    },
    title: {
        fontSize: 26,
        color: palette.text,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        color: palette.mutedText,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(10, 8, 60, 0.24)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    badge: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowMain: { flex: 1, gap: 2 },
    result: { fontSize: 15 },
    meta: { fontSize: 12, color: palette.mutedText },
    rowEnd: { alignItems: 'flex-end', gap: 2 },
    day: { fontSize: 12, color: palette.text },
    code: { fontSize: 11, color: palette.dimText, letterSpacing: 0.3 },
    empty: {
        alignItems: 'center',
        padding: 32,
        gap: 8,
        marginTop: 24,
    },
    emptyTitle: { fontSize: 16, color: palette.text },
    emptySub: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
});
