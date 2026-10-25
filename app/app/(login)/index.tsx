import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import Reanimated, {
    Easing as REasing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import AppDialog from '@/components/Dialog';
import { FloatingDiceArt } from '@/components/ludo/FloatingDiceArt';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';

const { width: W, height: H } = Dimensions.get('window');

const TOKENS = [
    { color: '#D94444', size: 26, top: 0.08, left: 0.08 },
    { color: '#3B7DD8', size: 18, top: 0.13, left: 0.72 },
    { color: '#2DAA5C', size: 22, top: 0.28, left: 0.85 },
    { color: '#E8A520', size: 30, top: 0.34, left: 0.04 },
    { color: '#D94444', size: 14, top: 0.50, left: 0.90 },
    { color: '#3B7DD8', size: 20, top: 0.56, left: 0.06 },
    { color: '#2DAA5C', size: 16, top: 0.68, left: 0.78 },
    { color: '#E8A520', size: 24, top: 0.72, left: 0.18 },
];

/**
 * A background token drifting up and down. It bounces back and forth with no
 * reset between loops (so it never jumps), each at its own pace and phase so
 * they don't move in lockstep.
 */
function Token({ color, size, top, left, index }: { color: string; size: number; top: number; left: number; index: number }) {
    const v = useSharedValue(0);
    const amp = 8 + (index % 3) * 3;
    useEffect(() => {
        v.value = withDelay(
            index * 230,
            withRepeat(withTiming(1, { duration: 1700 + index * 190, easing: REasing.inOut(REasing.sin) }), -1, true),
        );
    }, [v, index]);
    const style = useAnimatedStyle(() => ({
        transform: [{ translateY: (v.value * 2 - 1) * amp }],
        opacity: 0.55 + 0.2 * Math.sin(v.value * Math.PI),
    }));
    return (
        <Reanimated.View
            pointerEvents="none"
            style={[
                styles.token,
                { width: size, height: size, borderRadius: size / 2, backgroundColor: color, top: top * H, left: left * W },
                style,
            ]}
        >
            <View style={[styles.tokenInner, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]} />
        </Reanimated.View>
    );
}

function GridBackground({ opacity }: { opacity: Animated.Value }) {
    const CELL = 28;
    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;

    return (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]} pointerEvents="none">
            {Array.from({ length: cols }).map((_, c) => (
                <View
                    key={`col-${c}`}
                    style={{
                        position: 'absolute',
                        left: c * CELL,
                        top: 0, bottom: 0,
                        width: StyleSheet.hairlineWidth,
                        backgroundColor: '#ffffff',
                        opacity: 0.06,
                    }}
                />
            ))}
            {Array.from({ length: rows }).map((_, r) => (
                <View
                    key={`row-${r}`}
                    style={{
                        position: 'absolute',
                        top: r * CELL,
                        left: 0, right: 0,
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: '#ffffff',
                        opacity: 0.06,
                    }}
                />
            ))}
        </Animated.View>
    );
}

export default function AuthIndex() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'dark';
    const palette = Colors[scheme];


    const { signInWithGoogle, playAsGuest, loading, dialog, hideDialog } = useAuth();
    const busy = loading.googleLoading || loading.guestLoading;


    // Staggered fade/slide for UI sections
    const fadeGrid = useRef(new Animated.Value(0)).current;
    const fadeDice = useRef(new Animated.Value(0)).current;
    const slideDice = useRef(new Animated.Value(30)).current;
    const fadeLogo = useRef(new Animated.Value(0)).current;
    const slideLogo = useRef(new Animated.Value(20)).current;
    const fadeTag = useRef(new Animated.Value(0)).current;
    const fadePills = useRef(new Animated.Value(0)).current;
    const fadeCard = useRef(new Animated.Value(0)).current;
    const slideCard = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        // Staggered entrance
        const entrance = (fade: Animated.Value, slide?: Animated.Value, delay = 0) => {
            const anims: Animated.CompositeAnimation[] = [
                Animated.timing(fade, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ];
            if (slide) anims.push(
                Animated.timing(slide, { toValue: 0, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true })
            );
            return Animated.parallel(anims);
        };

        Animated.stagger(120, [
            entrance(fadeGrid, undefined, 0),
            entrance(fadeDice, slideDice, 80),
            entrance(fadeLogo, slideLogo, 200),
            entrance(fadeTag, undefined, 320),
            entrance(fadePills, undefined, 440),
            entrance(fadeCard, slideCard, 560),
        ]).start();
    }, []);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>

            <View style={styles.screen}>

                {/* Full-screen animated grid */}
                <GridBackground opacity={fadeGrid} />

                {/* Floating tokens */}
                {TOKENS.map((t, i) => (
                    <Token key={i} {...t} index={i} />
                ))}

                {/* ── CENTER LOGO AREA ── */}
                <View style={styles.logoArea}>
                    {/* The same floating dice and pawns as the Home screen */}
                    <Animated.View style={{ opacity: fadeDice, transform: [{ translateY: slideDice }], marginBottom: 14 }}>
                        <FloatingDiceArt size="large" />
                    </Animated.View>

                    {/* Logo */}
                    <Animated.View style={{ opacity: fadeLogo, transform: [{ translateY: slideLogo }] }}>
                        <Text weight="bold" style={styles.logo}>SIMPLE LUDO</Text>
                    </Animated.View>

                    {/* Tagline */}
                    <Animated.View style={[styles.taglineRow, { opacity: fadeTag }]}>
                        <View style={styles.divLine} />
                        <Text weight="semiBold" style={styles.tagline}>PLAY WITH YOUR SQUAD</Text>
                        <View style={styles.divLine} />
                    </Animated.View>

                    {/* Pills */}
                    <Animated.View style={[styles.pillRow, { opacity: fadePills }]}>
                        {[
                            { icon: 'microphone', iconColor: '#2DAA5C', label: 'Voice Chat' },
                            { dot: '#3B7DD8', label: '4 Players' },
                            { dot: '#E8A520', label: 'Real-time' },
                        ].map((p, i) => (
                            <View key={i} style={styles.pill}>
                                {p.icon
                                    ? <FontAwesome name={p.icon as any} size={9} color={p.iconColor} />
                                    : <View style={[styles.pillDot, { backgroundColor: p.dot }]} />
                                }
                                <Text weight="semiBold" style={styles.pillText}>{p.label}</Text>
                            </View>
                        ))}
                    </Animated.View>
                </View>

                {/* ── SIGN-IN CARD ── */}
                <Animated.View
                    style={[
                        styles.card,
                        {
                            backgroundColor: 'rgba(255, 255, 255, 0.11)',
                            opacity: fadeCard,
                            transform: [{ translateY: slideCard }],
                            paddingBottom: insets.bottom + 24,
                        },
                    ]}
                >
                    {/* Card handle */}
                    <View style={styles.cardHandle} />

                    <Text weight="bold" style={styles.welcome}>Ready to play?</Text>
                    <Text weight="medium" style={styles.subtitle}>Sign in to keep your stats and play with friends</Text>

                    {/* Google */}
                    <TouchableOpacity
                        style={[styles.btnGoogle, busy && styles.btnBusy]}
                        activeOpacity={0.85}
                        onPress={signInWithGoogle}
                        disabled={busy}
                    >
                        {loading.googleLoading ? (
                            <ActivityIndicator color="#3B3BE8" />
                        ) : (
                            <>
                                <FontAwesome name="google" size={16} color="#EA4335" />
                                <Text weight="bold" style={styles.btnGoogleText}>Continue with Google</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={styles.orRow}>
                        <View style={styles.orLine} />
                        <Text weight="semiBold" style={styles.orText}>OR</Text>
                        <View style={styles.orLine} />
                    </View>

                    {/* Email code · guest (no account; progress can be saved later from Profile) */}
                    <View style={styles.altRow}>
                        <TouchableOpacity
                            style={[styles.btnAlt, busy && styles.btnBusy]}
                            activeOpacity={0.85}
                            onPress={() => router.push('/(login)/otp')}
                            disabled={busy}
                        >
                            <FontAwesome name="envelope" size={15} color="#C0C0D8" />
                            <Text weight="bold" style={styles.btnAltText}>Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.btnAlt, busy && styles.btnBusy]}
                            activeOpacity={0.85}
                            onPress={() => void playAsGuest()}
                            disabled={busy}
                            accessibilityLabel="Play as guest"
                            accessibilityHint="Plays without an account. You can save your progress later from Profile."
                        >
                            {loading.guestLoading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <FontAwesome name="gamepad" size={15} color="#C0C0D8" />
                                    <Text weight="bold" style={styles.btnAltText}>Guest</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                    <Text weight="medium" style={styles.guestHint}>Guests can save their progress anytime from Profile.</Text>

                    <Text weight="regular" style={styles.terms}>
                        By continuing you agree to our{' '}
                        <Text weight="semiBold" style={styles.termsLink}>Terms</Text>
                        {' '}&{' '}
                        <Text weight="semiBold" style={styles.termsLink}>Privacy Policy</Text>
                    </Text>
                </Animated.View>

                <AppDialog
                    visible={dialog.visible}
                    title={dialog.title}
                    message={dialog.message}
                    onDismiss={hideDialog}
                />
            </View>
        </SafeAreaView >

    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    token: {
        position: 'absolute',
        borderWidth: 2.5,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokenInner: {
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    logoArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    logo: {
        fontSize: 40,
        letterSpacing: 2,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    taglineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        marginBottom: 24,
    },
    divLine: {
        width: 22,
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
    },
    tagline: {
        fontSize: 9,
        letterSpacing: 2.5,
        color: 'rgba(255, 255, 255, 0.45)',
    },
    pillRow: {
        flexDirection: 'row',
        gap: 8,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255, 255, 255, 0.16)',
        borderRadius: 20,
        paddingVertical: 6,
        paddingHorizontal: 11,
    },
    pillDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    pillText: {
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: 10,
    },

    // Card
    card: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255, 255, 255, 0.18)',
        paddingHorizontal: 24,
        paddingTop: 14,
    },
    cardHandle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.28)',
        alignSelf: 'center',
        marginBottom: 22,
    },
    welcome: {
        fontSize: 26,
        color: '#EEEEF8',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.52)',
        textAlign: 'center',
        marginTop: 5,
        marginBottom: 24,
    },
    btnBusy: { opacity: 0.6 },
    btnGoogle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 15,
    },
    btnGoogleText: {
        fontSize: 14,
        color: '#111120',
        letterSpacing: 0.2,
    },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255, 255, 255, 0.25)' },
    orText: { fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', letterSpacing: 1.2 },
    altRow: { flexDirection: 'row', gap: 11 },
    btnAlt: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
        borderRadius: 16,
        paddingVertical: 15,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    btnAltText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.82)',
        letterSpacing: 0.2,
    },
    guestHint: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.55)',
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 18,
    },
    terms: {
        textAlign: 'center',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
        lineHeight: 18,
    },
    termsLink: {
        color: 'rgba(255, 255, 255, 0.85)',
    },
});