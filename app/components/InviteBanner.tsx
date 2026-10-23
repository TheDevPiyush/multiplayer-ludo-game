import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View as RNView } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSocket } from '@/components/SocketProvider';
import { Text } from '@/components/Themed';

type Invite = { gameCode: string; username: string };

const SHOW_MS = 15_000;

/**
 * Pops in at the top when a friend invites you to a room while the app is
 * open. Not shown mid-game; the invite is still in the Alerts tab.
 */
export function InviteBanner() {
    const { socket } = useSocket();
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const [invite, setInvite] = useState<Invite | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const inGame = pathname.includes('board');

    useEffect(() => {
        if (!socket) return;
        const onUpdate = (e: { reason?: string; gameCode?: string; username?: string }) => {
            if (e.reason !== 'invite' || !e.gameCode) return;
            setInvite({ gameCode: e.gameCode, username: e.username ?? 'A friend' });
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setInvite(null), SHOW_MS);
        };
        socket.on('social:update', onUpdate);
        return () => {
            socket.off('social:update', onUpdate);
        };
    }, [socket]);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    if (!invite || inGame) return null;

    const join = () => {
        setInvite(null);
        router.push({ pathname: '/join/[code]', params: { code: invite.gameCode } });
    };

    return (
        <Animated.View
            entering={SlideInUp.duration(280)}
            exiting={SlideOutUp.duration(200)}
            style={[styles.wrap, { top: insets.top + 8 }]}
            pointerEvents="box-none"
        >
            <RNView style={styles.card}>
                <RNView style={styles.icon}>
                    <MaterialCommunityIcons name="dice-multiple" size={22} color="#FFFFFF" />
                </RNView>
                <RNView style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title} numberOfLines={1}>@{invite.username} invited you</Text>
                    <Text weight="medium" style={styles.sub} numberOfLines={1}>Room {invite.gameCode} · tap to join</Text>
                </RNView>
                <Pressable onPress={join} style={({ pressed }) => [styles.join, pressed && { opacity: 0.85 }]} hitSlop={6}>
                    <Text weight="bold" style={styles.joinText}>Join</Text>
                </Pressable>
                <Pressable onPress={() => setInvite(null)} hitSlop={10} accessibilityLabel="Dismiss">
                    <MaterialCommunityIcons name="close" size={20} color="#9097B8" />
                </Pressable>
            </RNView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A0832',
        shadowOpacity: 0.3,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FF5A5F', alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 15, color: '#1B1A4A' },
    sub: { fontSize: 12, color: '#7A7FA6', marginTop: 1 },
    join: { height: 38, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
    joinText: { fontSize: 14, color: '#FFFFFF' },
});
