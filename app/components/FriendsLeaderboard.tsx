import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { getLeaderboard, type Leaderboard, type LeaderboardRow, type PublicUser } from '@/apis/social-api';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';

const INK = '#1B1A4A';
const MUTED = '#7A7FA6';
const INDIGO = '#3B3BE8';
const TRACK = '#F1F0FA';
const MEDALS = ['#F5B400', '#9AA3BD', '#D9884A'];
const DAY_MS = 24 * 60 * 60_000;

function endsIn(endsAt: string): string {
    const days = Math.ceil((Date.parse(endsAt) - Date.now()) / DAY_MS);
    return days <= 1 ? 'Ends tonight' : `Ends in ${days} days`;
}

function RankBadge({ rank }: { rank: number }) {
    const medal = MEDALS[rank - 1];
    if (medal) {
        return (
            <View style={[styles.medal, { backgroundColor: medal }]}>
                <Text weight="bold" style={styles.medalText}>{rank}</Text>
            </View>
        );
    }
    return <Text weight="bold" style={styles.rank}>{rank}</Text>;
}

/**
 * The Friends sheet's "This week" tab: you and your friends by online wins since Monday.
 * Reloads when `revision` changes (friends added or removed).
 */
export function FriendsLeaderboard({ revision, onOpenPlayer }: { revision: number; onOpenPlayer: (user: PublicUser) => void }) {
    const [board, setBoard] = useState<Leaderboard | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        void getLeaderboard().then(res => {
            if (!live) return;
            if (res.ok) {
                setBoard(res.data);
                setError(null);
            } else {
                setError(res.error);
            }
        });
        return () => { live = false; };
    }, [revision]);

    if (!board) {
        return error
            ? <Text weight="medium" style={styles.message}>{error}</Text>
            : <ActivityIndicator color={INDIGO} style={{ marginTop: 32 }} />;
    }

    const alone = board.data.length <= 1;
    const renderRow = ({ item }: { item: LeaderboardRow }) => (
        <Pressable
            onPress={() => !item.you && onOpenPlayer(item.user)}
            style={({ pressed }) => [styles.row, item.you && styles.rowYou, pressed && !item.you && { opacity: 0.7 }]}
            accessibilityLabel={`${item.rank}. @${item.user.username}, ${item.wins} wins`}
        >
            <View style={styles.rankCol}><RankBadge rank={item.rank} /></View>
            <UserAvatar user={item.user} size={40} />
            <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                    <Text weight="bold" style={styles.username} numberOfLines={1}>@{item.user.username}</Text>
                    {item.you && (
                        <View style={styles.youChip}>
                            <Text weight="bold" style={styles.youText}>You</Text>
                        </View>
                    )}
                </View>
                <Text weight="medium" style={styles.sub}>
                    {item.games > 0 ? `${item.games} ${item.games === 1 ? 'game' : 'games'} this week` : 'No games yet'}
                </Text>
            </View>
            <View style={styles.wins}>
                <Text weight="bold" style={[styles.winsNum, item.wins === 0 && { color: MUTED }]}>{item.wins}</Text>
                <Text weight="semiBold" style={styles.winsLabel}>{item.wins === 1 ? 'win' : 'wins'}</Text>
            </View>
        </Pressable>
    );

    return (
        <Animated.View entering={FadeIn} style={{ flex: 1 }}>
            <View style={styles.head}>
                <MaterialCommunityIcons name="trophy" size={18} color={MEDALS[0]} />
                <Text weight="bold" style={styles.headTitle}>Online wins this week</Text>
                <View style={{ flex: 1 }} />
                <Text weight="semiBold" style={styles.headSub}>{endsIn(board.week.endsAt)}</Text>
            </View>
            <FlatList
                data={board.data}
                keyExtractor={r => r.user.id}
                renderItem={renderRow}
                ListFooterComponent={
                    alone
                        ? <Text weight="medium" style={styles.message}>Add friends to see how you stack up each week.</Text>
                        : <Text weight="medium" style={styles.note}>Games under 2 minutes don't count. Starts over every Monday.</Text>
                }
                contentContainerStyle={{ paddingBottom: 16 }}
                style={{ flex: 1 }}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 },
    headTitle: { fontSize: 14, color: INK },
    headSub: { fontSize: 12, color: MUTED },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 16 },
    rowYou: { backgroundColor: TRACK },
    rankCol: { width: 28, alignItems: 'center' },
    rank: { fontSize: 15, color: MUTED },
    medal: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    medalText: { fontSize: 13, color: '#FFFFFF' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    username: { flexShrink: 1, fontSize: 15, color: INK },
    youChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: INDIGO },
    youText: { fontSize: 10, color: '#FFFFFF' },
    sub: { fontSize: 12, color: MUTED, marginTop: 2 },
    wins: { alignItems: 'center', minWidth: 44 },
    winsNum: { fontSize: 20, color: INK, lineHeight: 24 },
    winsLabel: { fontSize: 10, color: MUTED },
    message: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
    note: { fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 14 },
});
