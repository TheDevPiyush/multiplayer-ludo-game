import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { leaveRoom } from '@/apis/game-api';
import { GameTile } from '@/components/GameTile';
import { FloatingDiceArt } from '@/components/ludo/FloatingDiceArt';
import { Text } from '@/components/Themed';
import { setActiveRoom } from '@/util/active-room';
import { quickMatchRoom } from '@/util/enter-room';
import { supabase } from '@/util/supabase-client';

/** Long enough for one roll and landing, so a fast match doesn't flash past. */
const MIN_SEARCH_MS = 1_800;
const LINE_MS = 1_800;
const LINES = ['Looking for an open table…', 'Checking who’s ready to play…', 'Saving you a seat…'];

/** Closed while the seat was being found: hand it back so the room doesn't wait on us. */
async function giveBack(gameCode: string) {
    await setActiveRoom(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) await leaveRoom(token, gameCode);
}

/** Join Public: rolls the dice while the server seats you in a game, then opens its lobby. */
export default function QuickMatchScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [line, setLine] = useState(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        let stale = false;
        setError(null);
        const startedAt = Date.now();
        void (async () => {
            const result = await quickMatchRoom();
            await new Promise(r => setTimeout(r, Math.max(0, MIN_SEARCH_MS - (Date.now() - startedAt))));
            if (!mounted.current) {
                if (result.ok) void giveBack(result.gameCode);
                return;
            }
            if (stale) return;
            if (result.ok) router.replace(result.href);
            else setError(result.error);
        })();
        return () => {
            stale = true;
        };
    }, [attempt, router]);

    useEffect(() => {
        if (error) return;
        const t = setInterval(() => setLine(l => (l + 1) % LINES.length), LINE_MS);
        return () => clearInterval(t);
    }, [error]);

    const close = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
            <RNView style={styles.header}>
                <Pressable onPress={close} style={styles.roundBtn} hitSlop={6} accessibilityLabel="Cancel">
                    <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
                </Pressable>
            </RNView>

            <RNView style={styles.center}>
                {error ? (
                    <Animated.View entering={FadeIn.duration(250)} style={styles.errorBox}>
                        <RNView style={styles.errorIcon}>
                            <MaterialCommunityIcons name="wifi-off" size={32} color="#FFFFFF" />
                        </RNView>
                        <Text weight="bold" style={styles.title}>Couldn’t find a game</Text>
                        <Text weight="medium" style={styles.line}>{error}</Text>
                        <GameTile
                            colors={['#FFFFFF', '#FFF1EC']}
                            edge="#C9CCE6"
                            radius={16}
                            depth={5}
                            onPress={() => setAttempt(a => a + 1)}
                            style={{ alignSelf: 'stretch', marginTop: 18 }}
                            contentStyle={styles.retryBtn}
                        >
                            <MaterialCommunityIcons name="refresh" size={18} color="#3B3BE8" />
                            <Text weight="bold" style={styles.retryText}>Try again</Text>
                        </GameTile>
                    </Animated.View>
                ) : (
                    <Animated.View entering={FadeInDown.duration(380)} style={styles.searching}>
                        <FloatingDiceArt size="large" rolling />
                        <Text weight="bold" style={styles.title}>Finding a game</Text>
                        <RNView style={styles.lineBox}>
                            <Animated.View key={line} entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
                                <Text weight="medium" style={styles.line}>{LINES[line]}</Text>
                            </Animated.View>
                        </RNView>
                    </Animated.View>
                )}
            </RNView>

            {!error && (
                <Text weight="medium" style={styles.footnote}>Games start within seconds. You can leave the lobby any time.</Text>
            )}
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 18 },
    header: { flexDirection: 'row' },
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
    searching: { alignItems: 'center', gap: 6 },
    title: { fontSize: 24, color: '#FFFFFF', marginTop: 18, textAlign: 'center' },
    lineBox: { height: 22, justifyContent: 'center' },
    line: { fontSize: 14, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
    footnote: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

    errorBox: { alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 12, gap: 6 },
    errorIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48 },
    retryText: { fontSize: 15, color: '#3B3BE8' },
});
