import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Keyboard,
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
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

function normalizeRoomCode(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);
}

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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function JoinRoomScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const codeInputRef = useRef<TextInput>(null);

    const [code, setCode] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
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
        ]).start();
    }, []);

    useEffect(() => {
        const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const onShow = Keyboard.addListener(show, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const onHide = Keyboard.addListener(hide, () => {
            setKeyboardHeight(0);
        });

        return () => {
            onShow.remove();
            onHide.remove();
        };
    }, []);

    useFocusEffect(
        useCallback(() => {
            const delay = Platform.OS === 'android' ? 220 : 80;
            const id = setTimeout(() => codeInputRef.current?.focus(), delay);
            return () => {
                clearTimeout(id);
                codeInputRef.current?.blur();
            };
        }, []),
    );

    const onCodeChange = useCallback((text: string) => {
        setCode(normalizeRoomCode(text));
    }, []);

    const pasteFromClipboard = useCallback(async () => {
        try {
            const raw = await Clipboard.getStringAsync();
            const next = normalizeRoomCode(raw ?? '');
            if (!next.length) {
                return;
            }
            setCode(next);
            codeInputRef.current?.focus();
        } catch {
            showError('Could not paste', 'Unable to read the clipboard.');
        }
    }, []);

    async function handleJoin() {
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
    }

    // Auto-submit when code is full
    useEffect(() => {
        if (code.length === CODE_LENGTH) void handleJoin();
    }, [code]);

    const isReady = code.length === CODE_LENGTH;

    const footerPadBottom =
        keyboardHeight > 0
            ? keyboardHeight + 12
            : insets.bottom + 24;

    return (
        <RNView style={[styles.screen, { backgroundColor: palette.background }]}>
            <RNView style={styles.screenInner}>

                <RNView style={[styles.blob, { top: -60, right: -60, backgroundColor: '#3B7DD8' }]} />
                <RNView style={[styles.blob, { bottom: -60, left: -60, backgroundColor: '#E8A520' }]} />

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

                <Animated.View style={[
                    styles.codeSection,
                    { opacity: fadeCode, transform: [{ translateY: slideCode }] },
                ]}>
                    <Text weight="medium" style={styles.codeHint}>
                        Enter or Paste the Simply Ludo - Code
                    </Text>

                    <RNView style={styles.codeEntryWrap}>
                        <Animated.View
                            pointerEvents="none"
                            style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
                            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                                <CodeSlot
                                    key={i}
                                    char={code[i] ?? ''}
                                    active={
                                        inputFocused &&
                                        !loading &&
                                        i === code.length
                                    }
                                />
                            ))}
                        </Animated.View>
                        <TextInput
                            ref={codeInputRef}
                            autoFocus
                            value={code}
                            onChangeText={onCodeChange}
                            maxLength={CODE_LENGTH}
                            editable={!loading}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            keyboardType={
                                Platform.OS === 'ios' ? 'ascii-capable' : 'default'
                            }
                            textContentType="none"
                            autoComplete="off"
                            importantForAutofill="no"
                            spellCheck={false}
                            caretHidden
                            blurOnSubmit={false}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            style={styles.hiddenCodeInput}
                            accessibilityLabel="Room code"
                        />
                    </RNView>

                    <RNView style={styles.codeActions}>
                        <TouchableOpacity
                            onPress={pasteFromClipboard}
                            style={styles.pasteBtn}
                            activeOpacity={0.7}>
                            <FontAwesome name="clipboard" size={14} color={palette.text} />
                            <Text weight="semiBold" style={styles.pasteBtnText}>Paste</Text>
                        </TouchableOpacity>

                        {code.length > 0 && (
                            <TouchableOpacity onPress={() => setCode('')} style={styles.clearBtn} activeOpacity={0.7}>
                                <Text weight="medium" style={styles.clearBtnText}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </RNView>
                </Animated.View>

                <RNView style={styles.spacerFlex} />

                <RNView style={[styles.footer, { paddingBottom: footerPadBottom }]}>
                    <AppButton
                        label={loading ? 'Joining...' : 'Join Room'}
                        onPress={handleJoin}
                        disabled={loading || !isReady}
                        leftIcon={
                            loading
                                ? (
                                    <ActivityIndicator />
                                )
                                : (
                                    <FontAwesome name="sign-in" size={15} color="#fff" />
                                )
                        }
                        style={[
                            { backgroundColor: palette.success, borderColor: palette.success },
                            loading && { opacity: 0.6 },
                        ]}
                        labelStyle={{ color: '#fff' }}
                    />
                </RNView>

                <AppDialog
                    visible={dialog.visible}
                    title={dialog.title}
                    message={dialog.message}
                    onDismiss={hideDialog}
                    actions={dialog.actions}
                />
            </RNView>
        </RNView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1 },
    screenInner: { flex: 1 },
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
        paddingTop: 36,
        paddingBottom: 16,
        gap: 16,
        paddingHorizontal: 16,
    },
    codeHint: {
        fontSize: 13,
        color: palette.mutedText,
        letterSpacing: 0.3,
    },
    codeEntryWrap: {
        position: 'relative',
        alignSelf: 'center',
        minHeight: 52,
        justifyContent: 'center',
    },
    codeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    hiddenCodeInput: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.02,
        color: 'transparent',
        fontSize: 18,
    },
    codeActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingTop: 8,
    },
    pasteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 18,
        backgroundColor: palette.elevated,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    pasteBtnText: {
        fontSize: 14,
        color: palette.text,
        letterSpacing: 0.2,
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
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    clearBtnText: {
        fontSize: 13,
        color: palette.mutedText,
    },

    spacerFlex: {
        flex: 1,
        minHeight: 24,
    },
    footer: {
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 35
    },
});