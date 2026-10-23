import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import Animated, {
    Easing,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameTile } from '@/components/GameTile';
import { useSocial } from '@/components/SocialProvider';
import { useSocket } from '@/components/SocketProvider';
import { UserAvatar } from '@/components/UserAvatar';
import { Dice3D } from '@/components/ludo/Dice';
import { COLOR_HEX } from '@/components/ludo/geometry';
import { Pawn } from '@/components/ludo/Token';
import { Text } from '@/components/Themed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { friendsHref } from '@/util/links';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Floating dice + pawns for the hero card. */
function HeroArt() {
    const float = useSharedValue(0);
    useEffect(() => {
        float.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
                withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
        );
    }, []);
    const diceStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -float.value * 8 }, { rotate: `${-12 + float.value * 6}deg` }],
    }));
    const pawnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value * 4 }] }));

    return (
        <RNView style={styles.heroArt} pointerEvents="none">
            <Animated.View style={[styles.heroPawnBack, pawnStyle]}>
                <Pawn color="BLUE" width={38} />
            </Animated.View>
            <Animated.View style={[styles.heroDice, diceStyle]}>
                <Dice3D value={6} size={62} color={COLOR_HEX.RED!} tilt={[-28, 34, 0]} />
            </Animated.View>
            <Animated.View style={[styles.heroPawnFront, pawnStyle]}>
                <Pawn color="YELLOW" width={44} />
            </Animated.View>
        </RNView>
    );
}

function HeroButton({ label, icon, primary, onPress }: { label: string; icon: IconName; primary?: boolean; onPress: () => void }) {
    const fg = primary ? '#E2364A' : '#FFFFFF';
    return (
        <GameTile
            // Create: white on a warm edge. Join: solid indigo so it stands out on the orange card.
            colors={primary ? ['#FFFFFF', '#FFF1EC'] : ['#4F46F0', '#3730D6']}
            edge={primary ? '#E2A895' : '#241C9E'}
            radius={16}
            depth={5}
            onPress={onPress}
            style={{ flex: primary ? 1.4 : 1 }}
            contentStyle={styles.heroBtn}
        >
            <MaterialCommunityIcons name={icon} size={18} color={fg} />
            <Text weight="bold" style={[styles.heroBtnText, { color: fg }]}>{label}</Text>
        </GameTile>
    );
}

function ModeTile({
    title,
    subtitle,
    icon,
    colors,
    edge,
    onPress,
}: {
    title: string;
    subtitle: string;
    icon: IconName;
    colors: [string, string];
    edge: string;
    onPress: () => void;
}) {
    return (
        <GameTile colors={colors} edge={edge} onPress={onPress} style={{ flex: 1 }} contentStyle={styles.modeTile}>
            <RNView style={styles.modeIcon}>
                <MaterialCommunityIcons name={icon} size={28} color="#FFFFFF" />
            </RNView>
            <RNView style={{ gap: 3, alignItems: 'center' }}>
                <Text weight="bold" style={styles.modeTitle}>{title}</Text>
                <Text weight="medium" style={styles.modeSub}>{subtitle}</Text>
            </RNView>
        </GameTile>
    );
}

export default function HomeTabScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user } = useCurrentUser();
    const { summary } = useSocial();
    const { connectionPhase } = useSocket();
    const connected = connectionPhase === 'connected';
    const requests = summary.incomingRequests;

    const username = user?.username ?? 'player';
    const games = user?.totalGames ?? 0;
    const wins = user?.totalWins ?? 0;
    const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <RNView style={styles.avatar} accessibilityLabel={connected ? 'Online' : 'Offline'}>
                    {user ? (
                        <UserAvatar user={user} size={40} />
                    ) : (
                        <Text weight="bold" style={styles.avatarText}>{username.slice(0, 2).toUpperCase()}</Text>
                    )}
                    {/* Live connection to the game server */}
                    <RNView style={[styles.connDot, { backgroundColor: connected ? '#22C55E' : '#FF3B4E' }]} />
                </RNView>
                <RNView style={{ flex: 1 }}>
                    <Text weight="medium" style={styles.hello}>Ready to roll?</Text>
                    <Text weight="bold" style={styles.name} numberOfLines={1}>@{username}</Text>
                </RNView>
                <Pressable
                    onPress={() => router.push(friendsHref(requests > 0 ? 'requests' : 'friends'))}
                    style={({ pressed }) => [styles.friendsBtn, pressed && { transform: [{ scale: 0.94 }] }]}
                    hitSlop={6}
                    accessibilityLabel="Friends"
                >
                    <MaterialCommunityIcons name="account-multiple-plus" size={22} color="#FFFFFF" />
                    {requests > 0 && (
                        <RNView style={styles.friendsBadge}>
                            <Text weight="bold" style={styles.friendsBadgeText}>{requests > 9 ? '9+' : requests}</Text>
                        </RNView>
                    )}
                </Pressable>
            </Animated.View>

            {/* Hero: online with friends */}
            <Animated.View entering={FadeInDown.delay(80).duration(450)}>
                <GameTile colors={['#FF5A5F', '#FF8A3D']} edge="#C2304A" contentStyle={styles.hero} radius={28} depth={7}>
                    <HeroArt />
                    <RNView style={styles.heroChip}>
                        <MaterialCommunityIcons name="microphone" size={12} color="#FFFFFF" />
                        <Text weight="bold" style={styles.heroChipText}>ONLINE · VOICE CHAT</Text>
                    </RNView>
                    <Text weight="bold" style={styles.heroTitle}>Play with{'\n'}Friends</Text>
                    <Text weight="medium" style={styles.heroSub}>Private rooms for 2–4 players</Text>
                    <RNView style={styles.heroBtnRow}>
                        <HeroButton label="Create room" icon="plus-circle" primary onPress={() => router.push('/(game)/create-room')} />
                        <HeroButton label="Join" icon="login-variant" onPress={() => router.push('/(game)/join-room')} />
                    </RNView>
                </GameTile>
            </Animated.View>

            {/* Offline modes */}
            <Animated.View entering={FadeInDown.delay(160).duration(450)} style={{ gap: 12 }}>
                <Text weight="bold" style={styles.section}>Play offline</Text>
                <RNView style={styles.row}>
                    <ModeTile
                        title="Vs Computer"
                        subtitle="Beat the bots"
                        icon="robot-happy"
                        colors={['#22D07A', '#0FAE62']}
                        edge="#08804A"
                        onPress={() => router.push({ pathname: '/(game)/local-setup', params: { mode: 'bots' } })}
                    />
                    <ModeTile
                        title="Pass & Play"
                        subtitle="Friends, one phone"
                        icon="account-group"
                        colors={['#FFC83D', '#FF9F1C']}
                        edge="#C9740A"
                        onPress={() => router.push({ pathname: '/(game)/local-setup', params: { mode: 'pass' } })}
                    />
                </RNView>
            </Animated.View>

            {/* Stats */}
            <Animated.View entering={FadeInDown.delay(240).duration(450)} style={styles.stats}>
                {[
                    { label: 'Games', value: String(games), icon: 'dice-multiple' as IconName },
                    { label: 'Wins', value: String(wins), icon: 'crown' as IconName },
                    { label: 'Win rate', value: `${winRate}%`, icon: 'chart-line' as IconName },
                ].map((s, i) => (
                    <RNView key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
                        <MaterialCommunityIcons name={s.icon} size={18} color="rgba(255,255,255,0.75)" />
                        <Text weight="bold" style={styles.statValue}>{s.value}</Text>
                        <Text weight="medium" style={styles.statLabel}>{s.label}</Text>
                    </RNView>
                ))}
            </Animated.View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: {
        paddingHorizontal: 20,
        paddingBottom: 24,
        gap: 22,
    },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#FFD54A',
    },
    avatarText: { fontSize: 16, color: '#3B3BE8' },
    connDot: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2.5,
        borderColor: '#4B3BF2',
    },
    hello: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
    name: { fontSize: 18, color: '#FFFFFF' },
    friendsBtn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    friendsBadge: {
        position: 'absolute',
        top: -3,
        right: -3,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 5,
        borderRadius: 10,
        backgroundColor: '#FF3B4E',
        borderWidth: 2,
        borderColor: '#4B3BF2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    friendsBadgeText: { fontSize: 10, color: '#FFFFFF' },

    hero: { padding: 22, paddingBottom: 20, minHeight: 262 },
    heroArt: { position: 'absolute', right: 6, top: 14, width: 140, height: 130 },
    heroDice: { position: 'absolute', right: 26, top: 6 },
    heroPawnBack: { position: 'absolute', right: 6, top: 52 },
    heroPawnFront: { position: 'absolute', right: 70, top: 62 },
    heroChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    heroChipText: { fontSize: 10, color: '#FFFFFF', letterSpacing: 1 },
    heroTitle: { fontSize: 32, lineHeight: 36, color: '#FFFFFF', marginTop: 14, letterSpacing: -0.5 },
    heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 6 },
    heroBtnRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
    heroBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
    },
    heroBtnText: { fontSize: 15 },

    section: { fontSize: 17, color: '#FFFFFF' },
    row: { flexDirection: 'row', gap: 14 },
    modeTile: { height: 184, padding: 18, alignItems: 'center', justifyContent: 'center', gap: 14 },
    modeIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeTitle: { fontSize: 18, color: '#FFFFFF', textAlign: 'center' },
    modeSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },

    stats: {
        flexDirection: 'row',
        borderRadius: 22,
        paddingVertical: 18,
        backgroundColor: 'rgba(10, 8, 60, 0.24)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)' },
    statValue: { fontSize: 20, color: '#FFFFFF', marginTop: 2 },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.4 },
});
