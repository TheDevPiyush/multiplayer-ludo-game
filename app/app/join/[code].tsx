import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View as RNView } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { GameTile } from '@/components/GameTile';
import { Text } from '@/components/Themed';
import { clearPendingJoin, setPendingLink } from '@/util/links';
import { joinRoomByCode } from '@/util/enter-room';

const CODE_RE = /^[A-Z0-9]{6}$/;

/**
 * Target of shared room links (https://…/join/ABC123 or simpleludo://join/ABC123):
 * joins the room and drops the player into its lobby.
 */
export default function JoinFromLinkScreen() {
    const router = useRouter();
    const { code: rawCode } = useLocalSearchParams<{ code: string }>();
    const code = String(rawCode ?? '').toUpperCase();
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        if (!CODE_RE.test(code)) {
            setError('This room link is not valid.');
            return;
        }

        (async () => {
            const result = await joinRoomByCode(code);
            if (!mounted.current) return;
            if (!result.ok && result.signedOut) {
                // Sign in first; the root layout brings the player back here afterwards.
                setPendingLink({ kind: 'join', code });
                router.replace('/(login)');
                return;
            }
            clearPendingJoin(code);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            router.replace(result.href);
        })();

        return () => {
            mounted.current = false;
        };
    }, [code, router]);

    return (
        <RNView style={styles.screen}>
            <Animated.View entering={ZoomIn.duration(320)} style={styles.card}>
                <RNView style={[styles.icon, error ? styles.iconError : null]}>
                    <MaterialCommunityIcons name={error ? 'link-variant-off' : 'dice-multiple'} size={30} color="#FFFFFF" />
                </RNView>
                <Text weight="bold" style={styles.title}>{error ? "Couldn't join" : 'Joining room'}</Text>
                {CODE_RE.test(code) && <Text weight="bold" style={styles.code}>{code}</Text>}
                {error ? (
                    <Animated.View entering={FadeIn} style={{ alignSelf: 'stretch', gap: 16 }}>
                        <Text weight="medium" style={styles.message}>{error}</Text>
                        <GameTile
                            colors={['#4F46F0', '#3730D6']}
                            edge="#241C9E"
                            radius={16}
                            depth={5}
                            onPress={() => router.replace('/(tabs)')}
                            contentStyle={styles.btn}
                        >
                            <Text weight="bold" style={styles.btnText}>Go home</Text>
                        </GameTile>
                    </Animated.View>
                ) : (
                    <ActivityIndicator color="#3B3BE8" size="large" style={{ marginTop: 8 }} />
                )}
            </Animated.View>
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
        gap: 10,
        padding: 24,
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
    },
    icon: {
        width: 64,
        height: 64,
        borderRadius: 22,
        backgroundColor: '#3B3BE8',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    iconError: { backgroundColor: '#E2364A' },
    title: { fontSize: 20, color: '#1B1A4A' },
    code: {
        fontSize: 26,
        letterSpacing: 6,
        color: '#3B3BE8',
        fontFamily: 'SpaceMono-Regular',
        paddingVertical: 6,
    },
    message: { fontSize: 14, color: '#5B5F86', textAlign: 'center' },
    btn: { height: 48, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontSize: 15, color: '#FFFFFF' },
});
