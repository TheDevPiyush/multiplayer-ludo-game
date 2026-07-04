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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import AppDialog from '@/components/Dialog';
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

function Token({
    color, size, top, left, anim,
}: { color: string; size: number; top: number; left: number; anim: Animated.Value }) {
    return (
        <Animated.View
            style={[
                styles.token,
                {
                    width: size, height: size, borderRadius: size / 2,
                    backgroundColor: color,
                    top: top * H, left: left * W,
                    transform: [{ translateY: anim }],
                    opacity: anim.interpolate({ inputRange: [-12, 0, 12], outputRange: [0.55, 0.75, 0.55] }),
                },
            ]}
        >
            <View style={[styles.tokenInner, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]} />
        </Animated.View>
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


    const { signInWithGithub, signInWithGoogle, loading, dialog, hideDialog } = useAuth();


    // Token float anims
    const tokenAnims = useRef(TOKENS.map(() => new Animated.Value(0))).current;

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

    // Dice pulse
    const pulseDice = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Float tokens
        tokenAnims.forEach((anim, i) => {
            const amp = 8 + (i % 3) * 3;
            const dur = 1600 + i * 200;
            Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, { toValue: -amp, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                    Animated.timing(anim, { toValue: amp, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                ])
            ).start();
        });

        // Dice pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseDice, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseDice, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

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
                    <Token key={i} {...t} anim={tokenAnims[i]} />
                ))}

                {/* ── CENTER LOGO AREA ── */}
                <View style={styles.logoArea}>
                    {/* Dice */}
                    <Animated.View style={{ opacity: fadeDice, transform: [{ translateY: slideDice }, { scale: pulseDice }], marginBottom: 20 }}>
                        <View style={styles.dice}>
                            <View style={[styles.dot, { top: 10, left: 10, backgroundColor: '#D94444' }]} />
                            <View style={[styles.dot, { top: 10, right: 10, backgroundColor: '#3B7DD8' }]} />
                            <View style={[styles.dot, { top: 21, left: 21, backgroundColor: 'rgba(255,255,255,0.6)' }]} />
                            <View style={[styles.dot, { bottom: 10, left: 10, backgroundColor: '#2DAA5C' }]} />
                            <View style={[styles.dot, { bottom: 10, right: 10, backgroundColor: '#E8A520' }]} />
                        </View>
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

                    <Text weight="bold" style={styles.welcome}>Welcome back</Text>
                    <Text weight="medium" style={styles.subtitle}>Sign in to continue playing</Text>

                    <View style={styles.btnStack}>
                        {/* Google */}
                        <TouchableOpacity
                            style={styles.btnGoogle}
                            activeOpacity={0.85}
                            onPress={signInWithGoogle}
                            disabled={loading.githubLoading || loading.googleLoading}
                        >
                            <FontAwesome name="google" size={16} color="#EA4335" />
                            <Text weight="bold" style={styles.btnGoogleText}>
                                {
                                    loading.googleLoading
                                        ?
                                        <ActivityIndicator color={"blue"}/>
                                        :
                                        "Continue with Google"
                                }
                            </Text>
                        </TouchableOpacity>

                        {/* GitHub */}
                        <TouchableOpacity
                            style={styles.btnGithub}
                            activeOpacity={0.85}
                            onPress={signInWithGithub}
                            disabled={loading.githubLoading || loading.googleLoading}
                        >
                            <FontAwesome name="github" size={16} color="#C0C0D8" />
                            <Text weight="bold" style={styles.btnGithubText}>
                                {
                                    loading.githubLoading
                                        ?
                                        <ActivityIndicator color={"blue"} />
                                        :
                                        "Continue with GitHub"
                                }
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text weight="regular" style={styles.terms}>
                        By signing in you agree to our{' '}
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
    dice: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.22)',
    },
    dot: {
        position: 'absolute',
        width: 9,
        height: 9,
        borderRadius: 4.5,
    },
    logo: {
        fontSize: 38,
        letterSpacing: 6,
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
    btnStack: {
        gap: 11,
        marginBottom: 20,
    },
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
    btnGithub: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
        borderRadius: 16,
        paddingVertical: 15,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    btnGithubText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.82)',
        letterSpacing: 0.2,
    },
    terms: {
        textAlign: 'center',
        fontSize: 11,
        color: '#2A2A42',
        lineHeight: 18,
    },
    termsLink: {
        color: '#3B7DD8',
    },
});