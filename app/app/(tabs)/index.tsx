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
import { Dice3D } from '@/components/ludo/Dice';
import { COLOR_HEX } from '@/components/ludo/geometry';
import { Pawn } from '@/components/ludo/Token';
import { Text } from '@/components/Themed';
import { useCurrentUser } from '@/hooks/useCurrentUser';

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
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.heroBtn, primary ? styles.heroBtnPrimary : styles.heroBtnGhost, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
            <MaterialCommunityIcons name={icon} size={18} color={primary ? '#E2364A' : '#FFFFFF'} />
            <Text weight="bold" style={[styles.heroBtnText, primary && { color: '#E2364A' }]}>{label}</Text>
        </Pressable>
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
            <MaterialCommunityIcons name={icon} size={92} color="#FFFFFF" style={styles.modeWatermark} />
            <RNView style={styles.modeIcon}>
                <MaterialCommunityIcons name={icon} size={24} color="#FFFFFF" />
            </RNView>
            <RNView style={{ gap: 2 }}>
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
                <RNView style={styles.avatar}>
                    <Text weight="bold" style={styles.avatarText}>{username.slice(0, 2).toUpperCase()}</Text>
                </RNView>
                <RNView style={{ flex: 1 }}>
                    <Text weight="medium" style={styles.hello}>Ready to roll?</Text>
                    <Text weight="bold" style={styles.name} numberOfLines={1}>@{username}</Text>
                </RNView>
                <RNView style={styles.trophyChip}>
                    <MaterialCommunityIcons name="trophy" size={16} color="#FFD54A" />
                    <Text weight="bold" style={styles.trophyText}>{wins}</Text>
                </RNView>
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
    hello: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
    name: { fontSize: 18, color: '#FFFFFF' },
    trophyChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(10, 8, 60, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    trophyText: { fontSize: 15, color: '#FFFFFF' },

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
        borderRadius: 16,
    },
    heroBtnPrimary: { flex: 1.4, backgroundColor: '#FFFFFF' },
    heroBtnGhost: { flex: 1, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)' },
    heroBtnText: { fontSize: 15, color: '#FFFFFF' },

    section: { fontSize: 17, color: '#FFFFFF' },
    row: { flexDirection: 'row', gap: 14 },
    modeTile: { height: 184, padding: 18, justifyContent: 'space-between' },
    modeWatermark: { position: 'absolute', right: -14, bottom: -16, opacity: 0.16 },
    modeIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeTitle: { fontSize: 18, color: '#FFFFFF' },
    modeSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },

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
