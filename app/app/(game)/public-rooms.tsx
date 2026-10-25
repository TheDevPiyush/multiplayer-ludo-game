import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, {
    Easing,
    FadeInDown,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listPublicRooms, type PublicRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { GameTile } from '@/components/GameTile';
import { COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import { UserAvatar } from '@/components/UserAvatar';
import { joinRoomByCode } from '@/util/enter-room';
import { supabase } from '@/util/supabase-client';

function timeAgo(iso: string): string {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
}

function RefreshButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
    const spin = useSharedValue(0);
    useEffect(() => {
        if (loading) {
            spin.value = 0;
            spin.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1);
        } else {
            cancelAnimation(spin);
            spin.value = withTiming(Math.ceil(spin.value / 360) * 360, { duration: 200 });
        }
    }, [loading, spin]);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

    return (
        <Pressable
            onPress={onPress}
            disabled={loading}
            hitSlop={6}
            accessibilityLabel="Refresh rooms"
            style={({ pressed }) => [styles.roundBtn, pressed && { transform: [{ scale: 0.92 }] }]}
        >
            <Animated.View style={style}>
                <MaterialCommunityIcons name="refresh" size={22} color="#FFFFFF" />
            </Animated.View>
        </Pressable>
    );
}

function RoomCard({ room, joining, onPress }: { room: PublicRoom; joining: boolean; onPress: () => void }) {
    const free = room.maxPlayers - room.playerCount;
    return (
        <Pressable onPress={onPress} disabled={joining} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
            {room.host ? <UserAvatar user={room.host} size={48} /> : <RNView style={{ width: 48 }} />}
            <RNView style={{ flex: 1, gap: 4 }}>
                <Text weight="bold" style={styles.cardTitle} numberOfLines={1}>
                    @{room.host?.username ?? 'player'}’s room
                </Text>
                <RNView style={styles.metaRow}>
                    {/* One dot per seat, filled in the player's colour. */}
                    <RNView style={styles.seats}>
                        {Array.from({ length: room.maxPlayers }, (_, i) => {
                            const p = room.players[i];
                            return (
                                <RNView
                                    key={i}
                                    style={[styles.seatDot, p ? { backgroundColor: COLOR_HEX[p.color] } : styles.seatDotEmpty]}
                                />
                            );
                        })}
                    </RNView>
                    <Text weight="medium" style={styles.meta} numberOfLines={1}>
                        {room.playerCount}/{room.maxPlayers}
                        {room.voiceEnabled ? ' · voice' : ''} · {timeAgo(room.createdAt)}
                    </Text>
                </RNView>
            </RNView>
            <RNView style={styles.joinChip}>
                {joining ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <>
                        <Text weight="bold" style={styles.joinText}>Join</Text>
                        <Text weight="medium" style={styles.joinSub}>{free} {free === 1 ? 'seat' : 'seats'}</Text>
                    </>
                )}
            </RNView>
        </Pressable>
    );
}

/** Browse open public rooms. Fetched on open and on the refresh button — no polling. */
export default function PublicRoomsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState<string | null>(null);
    const [joinError, setJoinError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) {
                setError('Please sign in first.');
                return;
            }
            const res = await listPublicRooms(token);
            if (res.ok) {
                setRooms(res.data.data);
                setError(null);
            } else {
                setError(res.error);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const join = async (room: PublicRoom) => {
        if (joining) return;
        setJoining(room.gameCode);
        const result = await joinRoomByCode(room.gameCode);
        setJoining(null);
        if (result.ok) {
            router.push(result.href);
            return;
        }
        // Filled up or started since the list was fetched.
        setJoinError(result.error);
        setRooms(rs => rs?.filter(r => r.gameCode !== room.gameCode) ?? rs);
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <RNView style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={6} accessibilityLabel="Back">
                    <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
                </Pressable>
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Public rooms</Text>
                    <Text weight="medium" style={styles.subtitle}>
                        {rooms ? `${rooms.length} open ${rooms.length === 1 ? 'room' : 'rooms'} · tap to join` : 'Finding open rooms…'}
                    </Text>
                </RNView>
                <RefreshButton loading={loading} onPress={() => void load()} />
            </RNView>

            <FlatList
                data={rooms ?? []}
                keyExtractor={r => r.gameCode}
                renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(280)}>
                        <RoomCard room={item} joining={joining === item.gameCode} onPress={() => void join(item)} />
                    </Animated.View>
                )}
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
                ListEmptyComponent={
                    rooms === null && !error ? (
                        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 48 }} />
                    ) : (
                        <RNView style={styles.empty}>
                            <RNView style={styles.emptyIcon}>
                                <MaterialCommunityIcons name={error ? 'wifi-off' : 'earth-off'} size={32} color="#FFFFFF" />
                            </RNView>
                            <Text weight="bold" style={styles.emptyTitle}>{error ? "Couldn't load rooms" : 'No open rooms right now'}</Text>
                            <Text weight="medium" style={styles.emptySub}>
                                {error ?? 'Start a public room and others can join it from here.'}
                            </Text>
                            {!error && (
                                <GameTile
                                    colors={['#FFFFFF', '#FFF1EC']}
                                    edge="#C9CCE6"
                                    radius={16}
                                    depth={5}
                                    onPress={() => router.push({ pathname: '/(game)/create-room', params: { visibility: 'public' } })}
                                    style={{ alignSelf: 'stretch', marginTop: 16 }}
                                    contentStyle={styles.createBtn}
                                >
                                    <MaterialCommunityIcons name="plus-circle" size={18} color="#3B3BE8" />
                                    <Text weight="bold" style={styles.createText}>Create a public room</Text>
                                </GameTile>
                            )}
                        </RNView>
                    )
                }
            />

            <AppDialog
                visible={!!joinError}
                title="Couldn't join"
                message={joinError ?? undefined}
                onDismiss={() => setJoinError(null)}
            />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
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
    subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

    list: { paddingHorizontal: 18, gap: 10, flexGrow: 1 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 8, 60, 0.26)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    cardTitle: { fontSize: 15, color: '#FFFFFF' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    seats: { flexDirection: 'row', gap: 4 },
    seatDot: { width: 10, height: 10, borderRadius: 5 },
    seatDotEmpty: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
    meta: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    joinChip: {
        minWidth: 72,
        height: 48,
        paddingHorizontal: 12,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#22C55E',
    },
    joinText: { fontSize: 14, color: '#FFFFFF' },
    joinSub: { fontSize: 10, color: 'rgba(255,255,255,0.9)' },

    empty: { alignItems: 'center', padding: 24, gap: 8, marginTop: 40 },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, color: '#FFFFFF' },
    emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48 },
    createText: { fontSize: 15, color: '#3B3BE8' },
});
