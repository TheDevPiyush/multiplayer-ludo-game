import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { supabase } from '@/util/supabase-client';

const palette = Colors.dark;

const COLOR_HEX: Record<string, string> = {
    RED: LUDO.red,
    BLUE: LUDO.blue,
    GREEN: LUDO.green,
    YELLOW: LUDO.yellow,
};

function formatWhen(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
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

function HistoryCard({ item }: { item: GameHistoryEntry }) {
    const myColor = COLOR_HEX[item.myColor] ?? palette.mutedText;
    const cancelled = item.status === 'CANCELLED';

    return (
        <GlassPanel intensity="heavy" style={styles.card}>
            <RNView style={styles.cardTop}>
                <RNView style={styles.cardLeft}>
                    <RNView style={[styles.colorDot, { backgroundColor: myColor }]} />
                    <RNView style={{ flex: 1 }}>
                        <Text weight="bold" style={styles.gameCode}>{item.gameCode}</Text>
                        <Text weight="medium" style={styles.meta}>
                            {item.playerCount} players · {item.myColor}
                        </Text>
                    </RNView>
                </RNView>
                <RNView style={[
                    styles.badge,
                    cancelled
                        ? styles.badgeCancelled
                        : item.isWin
                            ? styles.badgeWin
                            : styles.badgeLoss,
                ]}>
                    <Text weight="semiBold" style={styles.badgeText}>
                        {cancelled ? 'Cancelled' : item.isWin ? 'Won' : item.myRank ? `#${item.myRank}` : 'Lost'}
                    </Text>
                </RNView>
            </RNView>

            <RNView style={styles.divider} />

            <RNView style={styles.statsRow}>
                <RNView style={styles.stat}>
                    <Text weight="medium" style={styles.statLabel}>Started</Text>
                    <Text weight="semiBold" style={styles.statValue}>{formatWhen(item.startedAt)}</Text>
                </RNView>
                <RNView style={styles.stat}>
                    <Text weight="medium" style={styles.statLabel}>Ended</Text>
                    <Text weight="semiBold" style={styles.statValue}>{formatWhen(item.endedAt)}</Text>
                </RNView>
            </RNView>

            {duration(item.startedAt, item.endedAt) ? (
                <Text weight="medium" style={styles.duration}>
                    Duration · {duration(item.startedAt, item.endedAt)}
                </Text>
            ) : null}

            {!cancelled && item.winnerUsername ? (
                <Text weight="medium" style={styles.winner}>
                    Winner · @{item.winnerUsername}
                </Text>
            ) : null}
        </GlassPanel>
    );
}

export default function HistoryTabScreen() {
    const insets = useSafeAreaInsets();
    const [items, setItems] = useState<GameHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) {
                setError('Not signed in');
                return;
            }
            const result = await fetchGameHistory(token);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setItems(result.data.data);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

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
                    keyExtractor={item => `${item.gameCode}-${item.createdAt}`}
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingBottom: insets.bottom + 24,
                        gap: 12,
                    }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />
                    }
                    ListEmptyComponent={
                        <GlassPanel intensity="medium" style={styles.empty}>
                            <FontAwesome name="history" size={28} color={palette.dimText} />
                            <Text weight="semiBold" style={styles.emptyTitle}>No games yet</Text>
                            <Text weight="medium" style={styles.emptySub}>
                                {error ?? 'Finished matches will appear here.'}
                            </Text>
                        </GlassPanel>
                    }
                    renderItem={({ item }) => <HistoryCard item={item} />}
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
    card: { padding: 16, gap: 10 },
    cardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    cardLeft: { flexDirection: 'row', gap: 12, flex: 1 },
    colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
    gameCode: { fontSize: 16, color: palette.text, letterSpacing: 1 },
    meta: { fontSize: 12, color: palette.mutedText, marginTop: 2 },
    badge: {
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    badgeWin: { backgroundColor: 'rgba(55, 189, 106, 0.22)' },
    badgeLoss: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
    badgeCancelled: { backgroundColor: 'rgba(224, 72, 72, 0.18)' },
    badgeText: { fontSize: 11, color: palette.text },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: palette.glassBorder,
    },
    statsRow: { flexDirection: 'row', gap: 16 },
    stat: { flex: 1, gap: 2 },
    statLabel: {
        fontSize: 10,
        color: palette.dimText,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    statValue: { fontSize: 13, color: palette.text },
    duration: { fontSize: 12, color: palette.mutedText },
    winner: { fontSize: 12, color: palette.mutedText },
    empty: {
        alignItems: 'center',
        padding: 32,
        gap: 8,
        marginTop: 24,
    },
    emptyTitle: { fontSize: 16, color: palette.text },
    emptySub: { fontSize: 13, color: palette.mutedText, textAlign: 'center' },
});
