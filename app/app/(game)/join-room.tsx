import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
    Animated,
    Easing,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { joinRoom } from '@/apis/game-api';
import AppDialog from '@/components/Dialog';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { supabase } from '@/util/supabase-client';
import { AppButton } from '@/components/AppButton';
import { ActivityIndicator } from 'react-native-paper';

const palette = Colors['dark'];
const CODE_LENGTH = 6;
/** Max keys in one keypad row — QWERTY top row is 10-wide; slot size follows this */
const KEYPAD_MAX_KEYS_PER_ROW = 10;
const KEY_GAP = 8;
/** Keep in sync with `styles.numpad.paddingHorizontal` */
const NUMPAD_PAD_H = 20;
const KEYPAD_MAX_W = 450;

type KeypadRowSpec =
    | { align: 'grid'; keys: string[] }
    | { align: 'center'; keys: string[] };

/** All digits on one row (same width as top QWERTY row — 10 columns) */
const DIGIT_KEYPAD_ROWS: KeypadRowSpec[] = [
    {
        align: 'grid',
        keys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    },
];

/** QWERTY; ⌫ shares the bottom row with Z–M — rows centered under max width */
const LETTER_KEYPAD_ROWS: KeypadRowSpec[] = [
    { align: 'center', keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'] },
    { align: 'center', keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'] },
    { align: 'center', keys: ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'] },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CodeSlot({ char, active }: { char: string; active: boolean }) {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const blinkHalf = 220;
        if (active) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.35, duration: blinkHalf, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: blinkHalf, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulse.stopAnimation();
            pulse.setValue(1);
        }
    }, [active]);

    return (
        <RNView style={[styles.codeSlot, char && styles.codeSlotFilled]}>
            {char ? (
                <Text weight="bold" style={styles.codeSlotChar}>{char}</Text>
            ) : active ? (
                <Animated.View style={[styles.cursor, { opacity: pulse }]} />
            ) : null}
        </RNView>
    );
}

function NumKey({
    value,
    onPress,
    slotWidth,
    wrapperStyle,
}: {
    value: string;
    onPress: (v: string) => void;
    slotWidth: number;
    wrapperStyle?: StyleProp<ViewStyle>;
}) {
    if (!value) return <RNView style={{ width: slotWidth }} accessibilityElementsHidden />;

    const isDelete = value === '⌫';
    const d = slotWidth;
    const circle = { width: d, height: d, borderRadius: d / 2 };

    return (
        <RNView
            style={[
                { width: slotWidth, alignItems: 'center', justifyContent: 'center' },
                wrapperStyle,
            ]}>
            <Pressable
                onPressIn={() => onPress(value)}
                style={({ pressed }) => [
                    styles.key,
                    circle,
                    isDelete && styles.keyDelete,
                    pressed && styles.keyPressed,
                ]}
                android_ripple={
                    Platform.OS === 'android'
                        ? { color: 'rgba(255,255,255,0.12)', foreground: true, borderless: true }
                        : undefined
                }
            >
                {isDelete ? (
                    <FontAwesome name="chevron-left" size={16} color="rgba(255,255,255,0.95)" />
                ) : (
                    <Text weight="semiBold" style={styles.keyText}>{value}</Text>
                )}
            </Pressable>
        </RNView>
    );
}

function KeypadRow({
    spec,
    slotWidth,
    rowWidth,
    gap,
    onPress,
    rowStyle,
    keyWrapperForValue,
}: {
    spec: KeypadRowSpec;
    slotWidth: number;
    rowWidth: number;
    gap: number;
    onPress: (v: string) => void;
    rowStyle?: StyleProp<ViewStyle>;
    keyWrapperForValue?: (v: string) => StyleProp<ViewStyle> | undefined;
}) {
    if (spec.align === 'grid') {
        return (
            <RNView style={[styles.keyRow, { width: rowWidth, gap }, rowStyle]}>
                {spec.keys.map((k, i) => (
                    <NumKey
                        key={i}
                        value={k}
                        slotWidth={slotWidth}
                        onPress={onPress}
                        wrapperStyle={keyWrapperForValue?.(k)}
                    />
                ))}
            </RNView>
        );
    }

    return (
        <RNView style={[styles.keyRowCluster, { width: rowWidth }, rowStyle]}>
            <RNView style={styles.keyRowClusterSide} collapsable={false} />
            <RNView style={[styles.keyRowClusterKeys, { gap }]}>
                {spec.keys.map((k, i) => (
                    <NumKey
                        key={i}
                        value={k}
                        slotWidth={slotWidth}
                        onPress={onPress}
                        wrapperStyle={keyWrapperForValue?.(k)}
                    />
                ))}
            </RNView>
            <RNView style={styles.keyRowClusterSide} collapsable={false} />
        </RNView>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function JoinRoomScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();

    const keypadOuterW = Math.min(
        Math.max(windowWidth - NUMPAD_PAD_H * 2, 260),
        KEYPAD_MAX_W,
    );
    const keySlotW = Math.floor(
        (keypadOuterW - KEY_GAP * (KEYPAD_MAX_KEYS_PER_ROW - 1)) /
        KEYPAD_MAX_KEYS_PER_ROW,
    );
    const gridRowWidth =
        KEYPAD_MAX_KEYS_PER_ROW * keySlotW +
        KEY_GAP * (KEYPAD_MAX_KEYS_PER_ROW - 1);

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [dialog, setDialog] = useState({
        visible: false, title: '', message: '' as string | undefined,
        actions: undefined as undefined | { label: string; onPress: () => void }[],
    });

    const hideDialog = () => setDialog(p => ({ ...p, visible: false }));
    const showError = (title: string, message: string) =>
        setDialog({ visible: true, title, message, actions: undefined });

    // Shake anim for wrong code
    const shakeAnim = useRef(new Animated.Value(0)).current;

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // Entrance animations
    const fadeHeader = useRef(new Animated.Value(0)).current;
    const slideHeader = useRef(new Animated.Value(-16)).current;
    const fadeCode = useRef(new Animated.Value(0)).current;
    const slideCode = useRef(new Animated.Value(20)).current;
    const fadeKeys = useRef(new Animated.Value(0)).current;
    const slideKeys = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.stagger(100, [
            Animated.parallel([
                Animated.timing(fadeHeader, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideHeader, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(fadeCode, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideCode, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(fadeKeys, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideKeys, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
        ]).start();
    }, []);

    const handleKey = useCallback((key: string) => {
        if (key === '⌫') {
            setCode((prev) => prev.slice(0, -1));
            return;
        }
        setCode((prev) =>
            prev.length >= CODE_LENGTH ? prev : prev + key,
        );
    }, []);

    // Auto-submit when code is full
    useEffect(() => {
        if (code.length === CODE_LENGTH) handleJoin();
    }, [code]);

    const handleJoin = async () => {
        if (code.length < CODE_LENGTH) {
            shake();
            showError('Incomplete Code', `Room code must be ${CODE_LENGTH} characters.`);
            return;
        }

        try {
            setLoading(true);
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) { showError('Not signed in', 'Please sign in first.'); return; }

            const result = await joinRoom(token, code.toUpperCase());

            if (!result.ok) {
                shake();
                setCode('');
                showError('Could not join', result.error);
                return;
            }

            const { room } = result.data.data;

            router.push({
                pathname: '/(game)/lobby',
                params: {
                    gameCode: room.gameCode,
                    maxPlayers_: String(room.maxPlayers),
                    roomId: room.id,
                },
            });

        } catch {
            shake();
            showError('Error', 'Something went wrong. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const isReady = code.length === CODE_LENGTH;

    return (
        <RNView style={[styles.screen, { backgroundColor: palette.background }]}>

            {/* Ambient blobs */}
            <RNView style={[styles.blob, { top: -60, right: -60, backgroundColor: '#3B7DD8' }]} />
            <RNView style={[styles.blob, { bottom: -60, left: -60, backgroundColor: '#E8A520' }]} />

            {/* ── Header ── */}
            <Animated.View style={[
                styles.header,
                { paddingTop: insets.top + 12, opacity: fadeHeader, transform: [{ translateY: slideHeader }] },
            ]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <Text weight="bold" style={styles.headerTitle}>Join Room</Text>
                <RNView style={{ width: 36 }} />
            </Animated.View>

            {/* ── Code display ── */}
            <Animated.View style={[
                styles.codeSection,
                { opacity: fadeCode, transform: [{ translateY: slideCode }] },
            ]}>
                <Text weight="medium" style={styles.codeHint}>
                    Enter the room code
                </Text>

                <Animated.View style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                        <CodeSlot
                            key={i}
                            char={code[i] ?? ''}
                            active={i === code.length && !loading}
                        />
                    ))}
                </Animated.View>

                {/* Clear button */}
                {code.length > 0 && (
                    <TouchableOpacity onPress={() => setCode('')} style={styles.clearBtn} activeOpacity={0.7}>
                        <Text weight="medium" style={styles.clearBtnText}>Clear</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>

            {/* ── Keypad: numbers, then letters (⌫ on letter last row) ── */}
            <Animated.View style={[
                styles.numpad,
                { paddingBottom: insets.bottom + 24, opacity: fadeKeys, transform: [{ translateY: slideKeys }] },
            ]}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.keypadScrollContent}
                    bounces={false}
                >
                    <RNView style={[styles.keypadGrid, { width: gridRowWidth }]}>
                        <RNView style={styles.keySection}>
                            {DIGIT_KEYPAD_ROWS.map((spec, ri) => (
                                <KeypadRow
                                    key={`d-${ri}`}
                                    spec={spec}
                                    slotWidth={keySlotW}
                                    rowWidth={gridRowWidth}
                                    gap={KEY_GAP}
                                    onPress={handleKey}
                                />
                            ))}
                        </RNView>

                        <RNView style={[styles.keySection, styles.keySectionLetters]}>
                            {LETTER_KEYPAD_ROWS.map((spec, ri) => (
                                <KeypadRow
                                    key={`l-${ri}`}
                                    spec={spec}
                                    slotWidth={keySlotW}
                                    rowWidth={gridRowWidth}
                                    gap={KEY_GAP}
                                    onPress={handleKey}
                                    rowStyle={
                                        ri === LETTER_KEYPAD_ROWS.length - 1
                                            ? styles.keyRowLettersLast
                                            : undefined
                                    }
                                    keyWrapperForValue={(k) =>
                                        k === '⌫' ? styles.keyDeleteOuterMargin : undefined}
                                />
                            ))}
                        </RNView>
                    </RNView>
                </ScrollView>

                <AppButton
                    label={loading ? 'Joining...' : 'Join Room'}
                    onPress={handleJoin}
                    disabled={loading || !isReady}
                    leftIcon={
                        loading
                            ?
                            <ActivityIndicator />
                            :
                            <FontAwesome
                                name={loading ? 'spinner' : 'sign-in'}
                                size={15}
                                color="#fff"
                            />
                    }
                    style={[
                        { backgroundColor: palette.success, borderColor: palette.success },
                        loading && { opacity: 0.6 },
                    ]}
                    labelStyle={{ color: '#fff' }}
                />
            </Animated.View>

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={hideDialog}
                actions={dialog.actions}
            />
        </RNView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1 },
    blob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, opacity: 0.05 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: palette.border,
    },
    backBtn: {
        width: 36, height: 36,
        borderRadius: 10,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, color: palette.text, letterSpacing: 0.2 },

    // Code section
    codeSection: {
        alignItems: 'center',
        paddingTop: 40,
        paddingBottom: 24,
        gap: 24,
    },
    codeHint: {
        fontSize: 13,
        color: palette.mutedText,
        letterSpacing: 0.3,
    },
    codeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    codeSlot: {
        width: 50, height: 50,
        borderRadius: 16,
        backgroundColor: palette.card,
        borderWidth: 1.5,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    codeSlotFilled: {
        borderColor: palette.warning,
        backgroundColor: '#3B7DD808',
    },
    codeSlotChar: {
        fontSize: 28,
        color: palette.text,
        letterSpacing: 1,
        fontFamily: 'SpaceMono-Regular',
    },
    cursor: {
        width: 2,
        height: 28,
        borderRadius: 1,
        backgroundColor: '#3B7DD8',
    },
    clearBtn: {
        paddingVertical: 6,
        paddingHorizontal: 16,
    },
    clearBtnText: {
        fontSize: 13,
        color: palette.mutedText,
    },

    // Keypad
    numpad: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'flex-end',
        gap: 10,
        minHeight: 0,
    },
    keypadScrollContent: {
        gap: 8,
        paddingBottom: 4,
        flexGrow: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    keypadGrid: {
        alignSelf: 'center',
    },
    keySection: {
        gap: 8,
        alignSelf: 'center',
        width: '100%',
    },
    keySectionLetters: {
        marginTop: 6,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.border,
    },
    keySectionLabel: {
        fontSize: 10,
        color: palette.dimText,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 4,
        textAlign: 'center',
        alignSelf: 'stretch',
    },
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        justifyContent: 'flex-start',
    },
    keyRowCluster: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
    },
    keyRowClusterSide: {
        flex: 1,
        minWidth: 0,
    },
    keyRowClusterKeys: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    keyRowLettersLast: {
        marginTop: 6,
    },
    keyDeleteOuterMargin: {
        marginVertical: 3,
    },
    key: {
        overflow: 'hidden',
        backgroundColor: palette.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyDelete: {
        backgroundColor: 'rgb(255, 125, 125)',
    },
    keyPressed: {
        opacity: 0.82,
    },
    keyText: {
        fontSize: 19,
        color: palette.text,
    },
});